#!/bin/bash
set -euo pipefail

# ============================================
# Ananapi Status — Ubuntu VPS Deploy Script
# ============================================
# Usage:
#   1. Push repo to GitHub/GitLab
#   2. SSH into VPS
#   3. curl/scp this script onto VPS
#   4. chmod +x deploy.sh && sudo ./deploy.sh
# ============================================

APP_NAME="ananapi-status"
APP_DIR="/opt/$APP_NAME"
APP_USER="ananapi"
REPO_URL="${1:-}"  # Pass repo URL as first argument
PORT=3000
DOMAIN="${2:-}"    # Optional: pass domain as second argument

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[x]${NC} $1"; exit 1; }

# ---- Pre-checks ----
[ "$(id -u)" -ne 0 ] && err "Please run with sudo: sudo ./deploy.sh <repo-url> [domain]"
[ -z "$REPO_URL" ] && err "Usage: sudo ./deploy.sh <git-repo-url> [domain]\n  Example: sudo ./deploy.sh https://github.com/you/ananapi-status.git status.example.com"

# ---- Step 1: System dependencies ----
log "Installing system dependencies..."
apt-get update -qq
apt-get install -y -qq curl git build-essential nginx

# Install Node.js 22.x if not present or outdated
if ! command -v node &>/dev/null || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt 20 ]; then
  log "Installing Node.js 22.x..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
log "Node.js $(node -v) / npm $(npm -v)"

# Install PM2
if ! command -v pm2 &>/dev/null; then
  log "Installing PM2..."
  npm install -g pm2
fi

# ---- Step 2: Create app user ----
if ! id "$APP_USER" &>/dev/null; then
  log "Creating user: $APP_USER"
  useradd -r -m -s /bin/bash "$APP_USER"
fi

# ---- Step 3: Clone / pull repo ----
if [ -d "$APP_DIR/.git" ]; then
  log "Updating existing repo..."
  cd "$APP_DIR"
  sudo -u "$APP_USER" git pull --ff-only
else
  log "Cloning repo..."
  git clone "$REPO_URL" "$APP_DIR"
  chown -R "$APP_USER:$APP_USER" "$APP_DIR"
fi
cd "$APP_DIR"

# ---- Step 4: Setup .env ----
if [ ! -f "$APP_DIR/.env" ]; then
  warn "No .env file found. Creating template..."
  read -rp "Enter NUXT_ANANAPI_KEY: " API_KEY
  cat > "$APP_DIR/.env" <<ENVEOF
NUXT_ANANAPI_KEY=$API_KEY
NUXT_ANANAPI_BASE_URL=https://www.ananapi.com
NUXT_ANANAPI_MODEL=gpt-5.4
ENVEOF
  chown "$APP_USER:$APP_USER" "$APP_DIR/.env"
  chmod 600 "$APP_DIR/.env"
  log ".env created"
else
  log ".env already exists, skipping"
fi

# ---- Step 5: Install & build ----
log "Installing dependencies..."
sudo -u "$APP_USER" npm ci --production=false

log "Building for production..."
sudo -u "$APP_USER" npm run build

# ---- Step 6: PM2 setup ----
log "Starting with PM2..."
# Stop existing instance if running
pm2 delete "$APP_NAME" 2>/dev/null || true

# Create PM2 ecosystem file (Node 22 --env-file loads .env at runtime)
cat > "$APP_DIR/ecosystem.config.cjs" <<'PMEOF'
module.exports = {
  apps: [{
    name: 'ananapi-status',
    script: '.output/server/index.mjs',
    cwd: '/opt/ananapi-status',
    node_args: '--env-file=.env',
    env: {
      PORT: 3000,
      NODE_ENV: 'production',
    },
    instances: 1,
    autorestart: true,
    max_restarts: 10,
    restart_delay: 5000,
  }],
}
PMEOF
chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.cjs"

# Start as app user
sudo -u "$APP_USER" pm2 start "$APP_DIR/ecosystem.config.cjs"
sudo -u "$APP_USER" pm2 save

# Setup PM2 startup on boot
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER"

log "PM2 started on port $PORT"

# ---- Step 7: Nginx reverse proxy ----
log "Configuring Nginx..."
cat > /etc/nginx/sites-available/"$APP_NAME" <<NGEOF
server {
    listen 80;
    server_name ${DOMAIN:-_};

    location / {
        proxy_pass http://127.0.0.1:${PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGEOF

ln -sf /etc/nginx/sites-available/"$APP_NAME" /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx
log "Nginx configured"

# ---- Step 8: SSL (if domain provided) ----
if [ -n "$DOMAIN" ]; then
  log "Setting up SSL with Let's Encrypt..."
  apt-get install -y -qq certbot python3-certbot-nginx
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --register-unsafely-without-email || warn "SSL setup failed — you can retry: sudo certbot --nginx -d $DOMAIN"
fi

# ---- Done ----
echo ""
echo "=========================================="
log "Deployment complete!"
echo ""
echo "  App:    http://${DOMAIN:-localhost}:${PORT}"
if [ -n "$DOMAIN" ]; then
  echo "  URL:    https://$DOMAIN"
fi
echo ""
echo "  PM2:    pm2 status / pm2 logs $APP_NAME"
echo "  Update: cd $APP_DIR && git pull && npm ci && npm run build && pm2 restart $APP_NAME"
echo "=========================================="
