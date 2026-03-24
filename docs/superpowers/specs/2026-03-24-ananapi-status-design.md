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
│  │  每2分鐘     │──▶│  回應時間圖表   │   │
│  │  呼叫 API    │  │  歷史記錄表     │   │
│  │  寫入 SQLite │  │  Uptime 百分比  │   │
│  └──────────────┘  └────────────────┘   │
│         │                  ▲            │
│         ▼                  │            │
│  ┌──────────────────────────┐           │
│  │   SQLite (data/db.sqlite)│           │
│  │   checks 表              │           │
│  └──────────────────────────┘           │
└─────────────────────────────────────────┘
```

## 監測規格

- **目標端點**: `http://ananapi.com/v1/chat/completions`
- **監測頻率**: 每 2 分鐘
- **監測模型**: `gpt-5.4`
- **請求方式**: 輕量請求 `max_tokens: 1`, `messages: [{role: "user", content: "hi"}]`
- **超時設定**: 30 秒
- **記錄指標**: 回應時間 (ms)、HTTP 狀態碼、成功/失敗/超時狀態、錯誤訊息

## 資料模型

### checks 表

```sql
CREATE TABLE checks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp   INTEGER NOT NULL,        -- Unix timestamp (ms)
  status      TEXT    NOT NULL,        -- 'ok' | 'error' | 'timeout'
  latency     INTEGER,                 -- 回應時間 (ms)
  status_code INTEGER,                 -- HTTP 狀態碼 (200, 429, 500...)
  error       TEXT,                    -- 錯誤訊息（成功時為 null）
  model       TEXT    NOT NULL,        -- 使用的模型名稱
  created_at  TEXT    DEFAULT (datetime('now'))
);

CREATE INDEX idx_checks_timestamp ON checks(timestamp);
```

- **資料保留**: 30 天，超過由定時任務清理

## Server 端設計

### Server Plugin (`server/plugins/monitor.ts`)

- 應用啟動時初始化 SQLite 連線和建表
- 啟動 `node-cron` 定時任務，每 2 分鐘執行健康檢查
- 健康檢查流程：
  1. 記錄開始時間
  2. 向 API 發送請求
  3. 計算延遲，記錄狀態碼
  4. 超時 30 秒記為 `timeout`
  5. 寫入 SQLite

### API Routes

- **`GET /api/status`** — 當前狀態
  - 最近一次檢查結果
  - 24h uptime 百分比

- **`GET /api/checks`** — 歷史記錄
  - 查詢參數: `?range=24h|7d|30d`
  - 24h: 返回每筆原始數據
  - 7d: 按小時聚合
  - 30d: 按天聚合

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
- X 軸時間，Y 軸延遲 (ms)
- 異常點紅色標記

#### 4. 歷史事件時間軸
- 連續失敗歸為一次事件
- 顯示：發生時間、持續時長、錯誤類型

#### 5. Footer
- 「每 2 分鐘自動監測」說明
- 頁面每 60 秒自動刷新數據

### 設計風格
- 由 `ui-ux-pro-max` skill 主導
- 簡潔現代的公開狀態頁風格
- 參考 Instatus / Betterstack 視覺調性

## 技術依賴

| 套件 | 用途 |
|------|------|
| `nuxt` 3.x | 全端框架 |
| `better-sqlite3` | SQLite 驅動 |
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

全端應用部署至 VPS，使用 `node` 直接運行或搭配 PM2 進程管理。
