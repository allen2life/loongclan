-- ═══════════════════════════════════════════════════════════════
-- 龙族统一平台数据表 (D1 / SQLite Schema)
-- 遵从 SPEC_IDENTITY 与 SPEC_SYNC 铁律：
-- 1. 口令原文 100% 留在前端客户端，绝对不离机，服务端绝不存储明文口令；
-- 2. 身份验证使用 64 位私密鉴权密文 (sync_token)，公开标识使用 64 位 user_hash；
-- 3. 界面与榜单只展示用户昵称 (nickname)，绝不公开口令。
-- ═══════════════════════════════════════════════════════════════

-- 1. 通用数据快照表 (Universal Sync Snapshots)
CREATE TABLE IF NOT EXISTS sync_snapshots (
  app_id TEXT NOT NULL,
  user_hash TEXT NOT NULL,
  sync_token TEXT NOT NULL DEFAULT '',
  nickname TEXT NOT NULL DEFAULT '',
  version INTEGER NOT NULL DEFAULT 1,
  client_version TEXT NOT NULL DEFAULT '',
  snapshot_at TEXT NOT NULL DEFAULT '',
  payload TEXT NOT NULL DEFAULT '{}',
  size INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (app_id, user_hash)
);

CREATE INDEX IF NOT EXISTS idx_sync_app_updated ON sync_snapshots (app_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_user_hash ON sync_snapshots (user_hash);

-- 2. 通用排行榜表 (Universal Leaderboards)
CREATE TABLE IF NOT EXISTS rank_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  app_id TEXT NOT NULL,
  board_id TEXT NOT NULL,
  period TEXT NOT NULL DEFAULT 'all',      -- 'all', 'daily', 'weekly'
  time_bucket INTEGER NOT NULL DEFAULT 0,  -- 0 for all; YYYYMMDD for daily; YYYYWW for weekly
  user_hash TEXT NOT NULL,
  nickname TEXT NOT NULL DEFAULT '',
  score INTEGER NOT NULL DEFAULT 0,
  stars INTEGER NOT NULL DEFAULT 0,
  extra_data TEXT NOT NULL DEFAULT '',
  publish_time INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT 0,
  UNIQUE(app_id, board_id, period, time_bucket, user_hash)
);

CREATE INDEX IF NOT EXISTS idx_rank_query ON rank_scores (
  app_id, board_id, period, time_bucket, score DESC, publish_time ASC
);

-- 3. 封禁名单 (Banned User Hashes)
CREATE TABLE IF NOT EXISTS banned_users (
  user_hash TEXT PRIMARY KEY,
  reason TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0
);

-- 4. 轻量风控限流表 (Rate Limits · SPEC_RANK §3)
-- 固定窗口计数，支持单 IP / 单 userHash 维度的提交频率限制
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_rate_window ON rate_limits (window_start);
