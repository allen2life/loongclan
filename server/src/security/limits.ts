/**
 * 轻量风控与限流层 (Rate Limiting & Sanity Bounds)
 * 遵从 SPEC_RANK §3 防刷与轻量风控机制：
 *   1. 同一 userHash 成绩提交至少间隔 5 秒；
 *   2. 单 IP 每分钟最多提交 20 次；
 *   3. 极值上限阈值 (Sanity Bounds) 直接拒绝异常分数。
 *
 * 实现说明：使用 D1 / SQLite 单表定长窗口计数，无额外依赖，
 * 在 Cloudflare Workers 与本地 Node 单机模式下行为完全一致。
 */

const RATE_LIMIT_TABLE = `CREATE TABLE IF NOT EXISTS rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL DEFAULT 0,
  hits INTEGER NOT NULL DEFAULT 0
)`;

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSec: number;
  remaining: number;
}

export class RateLimiter {
  db: D1Database;

  constructor(db: D1Database) {
    this.db = db;
  }

  /** 确保限流表存在（幂等，本地单机模式与 D1 均适用） */
  async ensureTable(): Promise<void> {
    try {
      await this.db.prepare(RATE_LIMIT_TABLE).run();
    } catch {
      // 表已存在或并发创建，忽略
    }
  }

  /**
   * 固定窗口计数。返回是否放行。
   * @param key      限流维度键（如 `ip:1.2.3.4` / `rank:submit:<hash>`）
   * @param windowSec 窗口秒数
   * @param maxHits   窗口内允许的最大次数
   */
  async hit(key: string, windowSec: number, maxHits: number): Promise<RateLimitResult> {
    const nowSec = Math.floor(Date.now() / 1000);
    const windowStart = nowSec - (nowSec % windowSec);

    const row = await this.db
      .prepare('SELECT window_start, hits FROM rate_limits WHERE bucket_key = ?')
      .bind(key)
      .first<{ window_start: number; hits: number }>();

    // 新窗口或首次记录
    if (!row || row.window_start !== windowStart) {
      await this.db
        .prepare(
          `INSERT INTO rate_limits (bucket_key, window_start, hits) VALUES (?, ?, 1)
           ON CONFLICT(bucket_key) DO UPDATE SET window_start = excluded.window_start, hits = 1`
        )
        .bind(key, windowStart)
        .run();
      return { allowed: true, retryAfterSec: 0, remaining: maxHits - 1 };
    }

    if (row.hits >= maxHits) {
      return {
        allowed: false,
        retryAfterSec: Math.max(1, windowStart + windowSec - nowSec),
        remaining: 0
      };
    }

    await this.db
      .prepare('UPDATE rate_limits SET hits = hits + 1 WHERE bucket_key = ?')
      .bind(key)
      .run();

    return { allowed: true, retryAfterSec: 0, remaining: maxHits - row.hits - 1 };
  }

  /** 清理超过 1 天的历史窗口记录，防止表无限增长 */
  async prune(): Promise<void> {
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    try {
      await this.db.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(cutoff).run();
    } catch {
      // 清理失败不影响主流程
    }
  }
}

/** 从请求头解析真实客户端 IP（Cloudflare 与常规代理均支持） */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('CF-Connecting-IP') ||
    headers.get('X-Real-IP') ||
    headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

/**
 * 读取布尔型环境变量（默认值可指定）
 * Workers vars 与本地 process.env 均以字符串传入
 */
export function flag(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null || value === '') return fallback;
  const s = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(s)) return true;
  if (['0', 'false', 'no', 'off'].includes(s)) return false;
  return fallback;
}

/** 读取数值型环境变量 */
export function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** appId 规范：1-32 字符，小写字母/数字/下划线/连字符 */
export function isValidAppId(appId: unknown): appId is string {
  return typeof appId === 'string' && /^[a-zA-Z0-9_-]{1,32}$/.test(appId);
}

/** boardId 规范：1-64 字符，安全字符集 */
export function isValidBoardId(boardId: unknown): boardId is string {
  return typeof boardId === 'string' && /^[a-zA-Z0-9_.:-]{1,64}$/.test(boardId);
}
