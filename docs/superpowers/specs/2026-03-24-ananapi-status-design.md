# Ananapi Status — API 可用性監測公開狀態頁

## 概述

為 ananapi.com 的 OpenAI 相容接口建立公開狀態頁，讓用戶即時查看 API 可用性、回應時間和歷史趨勢。

## 定位

公開狀態頁，類似 Instatus / Betterstack 的風格，任何人都可以訪問查看 API 運行狀態。

## 架構

### 方案：Nuxt 3 全端一體

單一 Nuxt 3 進程，前後端一體化。Server plugin 負責定時監測，前端渲染狀態頁。

```
┌─────────────────────────────────────────┐
│              Nuxt 3 App                 │
│                                         │
│  ┌──────────────┐  ┌────────────────┐   │
│  │  Server       │  │  Frontend      │   │
│  │              │  │                │   │
│  │  node-cron   │  │  狀態指示燈     │   │
│  │  每2分鐘     │  │  回應時間圖表   │   │
│  │  呼叫 API    │  │  歷史記錄表     │   │
│  │  寫入 SQLite │  │  Uptime 百分比  │   │
│  └──────┬───────┘  └───────▲────────┘   │
│         │                  │            │
│         ▼     API Routes   │            │
│  ┌──────────────────────────┐           │
│  │  SQLite (data/db.sqlite) │           │
│  │  checks 表 (WAL mode)    │           │
│  └──────────────────────────┘           │
└─────────────────────────────────────────┘
```

## 監測規格

- **目標端點**: `http://ananapi.com/v1/chat/completions`
- **監測頻率**: 每 2 分鐘
- **監測模型**: `gpt-5.4`
- **超時設定**: 30 秒
- **重疊保護**: cron 任務加 `isRunning` 鎖，前一次未完成時跳過

### 完整健康檢查請求

```http
POST http://ananapi.com/v1/chat/completions
Content-Type: application/json
Authorization: Bearer $ANANAPI_KEY

{
  "model": "gpt-5.4",
  "max_tokens": 1,
  "stream": false,
  "messages": [{"role": "user", "content": "hi"}]
}
```

### 記錄指標

- 回應時間 (ms)
- HTTP 狀態碼
- 成功 (`ok`) / 失敗 (`error`) / 超時 (`timeout`) 狀態
- 錯誤訊息

## 狀態判定閾值

| 狀態 | 條件 |
|------|------|
| 綠色 (Operational) | 最近一次檢查成功 且 延遲 < 5000ms |
| 黃色 (Degraded) | 最近一次檢查成功 但 延遲 >= 5000ms，或最近 5 次中有 1-2 次失敗 |
| 紅色 (Down) | 最近一次檢查失敗，或最近 5 次中有 3 次以上失敗 |

## 資料模型

### checks 表

```sql
CREATE TABLE checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   INTEGER NOT NULL,        -- Unix timestamp (ms)
  status      TEXT    NOT NULL,        -- 'ok' | 'error' | 'timeout'
  latency     INTEGER,                 -- 回應時間 (ms)
  status_code INTEGER,                 -- HTTP 狀態碼 (200, 429, 500...)
  error       TEXT                     -- 錯誤訊息（成功時為 null）
);

CREATE INDEX idx_checks_timestamp ON checks(timestamp);
```

- **SQLite WAL mode**: 啟用以支援並發讀寫
- **資料保留**: 30 天，每小時執行一次清理（`DELETE FROM checks WHERE timestamp < ?`），由同一個 cron 排程管理

## Server 端設計

### Server Plugin (`server/plugins/monitor.ts`)

- 應用啟動時：
  1. 初始化 SQLite 連線（WAL mode）和建表
  2. 驗證 `ANANAPI_KEY` 環境變數存在，缺失時 log 警告並停止監測
  3. 啟動 `node-cron` 定時任務
- 健康檢查流程：
  1. 檢查 `isRunning` 鎖，若為 true 則跳過
  2. 設置 `isRunning = true`
  3. 記錄開始時間
  4. 發送請求（30 秒超時）
  5. 計算延遲，記錄狀態碼
  6. 寫入 SQLite
  7. 設置 `isRunning = false`
- 應用關閉時：停止 cron 任務，關閉 SQLite 連線（Nitro `close` hook）

### API Routes

#### `GET /api/status`

回應格式：

```json
{
  "status": "ok",
  "latency": 342,
  "statusCode": 200,
  "uptime24h": 99.7,
  "lastCheck": 1711234567890,
  "recentChecks": 5,
  "recentFailures": 0
}
```

#### `GET /api/checks?range=24h|7d|30d`

回應格式：

```json
{
  "range": "24h",
  "data": [
    {
      "timestamp": 1711234567890,
      "avgLatency": 342,
      "maxLatency": 520,
      "totalChecks": 1,
      "successCount": 1,
      "failureCount": 0,
      "uptime": 100
    }
  ]
}
```

**聚合邏輯**：
- **24h**: 返回每筆原始數據（~720 點）
- **7d**: 按小時聚合（~168 點），計算該小時內的平均延遲、最大延遲、成功/失敗次數
- **30d**: 按天聚合（~30 點），同上邏輯

### 事件歸組邏輯

連續失敗（status 為 `error` 或 `timeout`）視為同一事件。兩次失敗之間若有一次成功則斷開為不同事件。查詢時計算，不額外儲存。

每個事件包含：
- 開始時間（第一次失敗的 timestamp）
- 結束時間（最後一次失敗的 timestamp）
- 持續時長
- 失敗次數
- 錯誤類型摘要（最常見的 error 訊息）

### 環境變數

- `ANANAPI_KEY` — API 金鑰，存於 `.env`，不進 git

## 前端設計

### 頁面結構（由上至下）

#### 1. Header
- 站名 "Ananapi Status"
- 整體狀態指示：
  - 綠色：「所有系統正常運作」
  - 黃色：「回應緩慢」
  - 紅色：「服務異常」

#### 2. 即時狀態卡片
- 端點名稱：`OpenAI API (gpt-5.4)`
- 狀態燈（綠/黃/紅）
- 最近一次回應時間
- 24h Uptime 百分比

#### 3. 回應時間圖表
- Chart.js 折線圖
- 時間範圍切換：24h / 7d / 30d
- X 軸時間（用戶本地時區），Y 軸延遲 (ms)
- 異常點紅色標記

#### 4. 歷史事件時間軸
- 按事件歸組邏輯顯示
- 顯示：發生時間、持續時長、失敗次數、錯誤類型

#### 5. Footer
- 「每 2 分鐘自動監測」說明
- 頁面每 60 秒自動刷新數據

### 數據刷新機制

使用 `useFetch` 搭配 `setInterval` 每 60 秒呼叫 `refresh()`，頁面不重載。當瀏覽器 tab 不可見時暫停 polling（`visibilitychange` 事件）。

### 時區

所有時間以用戶本地時區顯示，內部儲存 Unix timestamp。

### 響應式設計

支援桌面和手機瀏覽，圖表和卡片在小螢幕自動適配。

### 設計風格
- 由 `ui-ux-pro-max` skill 主導
- 簡潔現代的公開狀態頁風格
- 參考 Instatus / Betterstack 視覺調性

## 技術依賴

| 套件 | 用途 |
|------|------|
| `nuxt` 3.x | 全端框架 |
| `better-sqlite3` | SQLite 驅動（需 VPS 有 build-essential / node-gyp） |
| `node-cron` | 定時任務排程 |
| `chart.js` + `vue-chartjs` | 回應時間圖表 |
| `date-fns` | 時間格式化與計算 |

Nuxt 內建（無需額外安裝）：`ofetch`、`useAsyncData`、`useFetch`、Nitro server routes

## 專案結構

```
ananapi-status/
├── server/
│   ├── plugins/monitor.ts      # 啟動 cron + 初始化 DB
│   ├── utils/db.ts             # SQLite 連線與查詢封裝
│   └── api/
│       ├── status.get.ts       # 當前狀態 API
│       └── checks.get.ts      # 歷史記錄 API
├── pages/
│   └── index.vue               # 狀態頁主頁
├── components/
│   ├── StatusHeader.vue        # Header + 整體狀態
│   ├── StatusCard.vue          # 即時狀態卡片
│   ├── LatencyChart.vue        # 回應時間圖表
│   └── IncidentTimeline.vue    # 歷史事件時間軸
├── data/                       # SQLite 檔案（gitignore）
├── .env                        # API 金鑰
└── nuxt.config.ts
```

## 告警

目前不需要告警通知，僅在狀態頁上顯示異常狀態。

## 部署

全端應用部署至 VPS：
- 使用 PM2 進程管理
- VPS 需安裝 `build-essential`、`python3`（`better-sqlite3` 原生編譯依賴）
- `.env` 設定 `ANANAPI_KEY`
- `data/` 目錄需可寫權限
