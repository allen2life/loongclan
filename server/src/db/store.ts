/**
 * 数据库操作统一层 (D1 / SQLite Store)
 * 遵从 SPEC_IDENTITY、SPEC_SYNC 与 SPEC_RANK 规范
 */

export interface SyncRecord {
  app_id: string;
  user_hash: string;
  sync_token: string;
  nickname: string;
  version: number;
  client_version: string;
  snapshot_at: string;
  payload: string;
  size: number;
  updated_at: number;
  created_at: number;
}

export interface RankScoreRecord {
  id?: number;
  app_id: string;
  board_id: string;
  period: string;
  time_bucket: number;
  user_hash: string;
  nickname: string;
  score: number;
  stars: number;
  extra_data: string;
  publish_time: number;
  created_at?: number;
}

export interface RankQueryResult {
  list: Array<{
    rank: number;
    userHash: string;
    nickname: string;
    score: number;
    stars: number;
    publishTime: number;
    extraData: string;
  }>;
  userRank?: {
    rank: number;
    score: number;
    stars: number;
  };
  totalCount: number;
}

export interface SystemStats {
  totalSnapshots: number;
  totalRankScores: number;
  appCounts: Record<string, number>;
  totalBanned: number;
}

export class D1Store {
  db: D1Database;
  constructor(db: D1Database) {
    this.db = db;
  }

  // ── Sync Operations ──

  async getSnapshot(appId: string, userHash: string): Promise<SyncRecord | null> {
    const row = await this.db
      .prepare('SELECT * FROM sync_snapshots WHERE app_id = ? AND user_hash = ?')
      .bind(appId, userHash.toLowerCase())
      .first<SyncRecord>();
    return row || null;
  }

  async saveSnapshot(record: Omit<SyncRecord, 'created_at'>): Promise<{ version: number; conflict: boolean; serverVersion: number }> {
    const userHash = record.user_hash.toLowerCase();
    const existing = await this.getSnapshot(record.app_id, userHash);
    const now = Date.now();

    if (existing) {
      // 冲突判定：如果本地版本落后于云端版本
      if (record.version < existing.version) {
        return {
          version: existing.version,
          conflict: true,
          serverVersion: existing.version
        };
      }

      const nextVersion = Math.max(existing.version + 1, record.version);
      await this.db
        .prepare(
          `UPDATE sync_snapshots
           SET sync_token = ?, nickname = ?, version = ?, client_version = ?,
               snapshot_at = ?, payload = ?, size = ?, updated_at = ?
           WHERE app_id = ? AND user_hash = ?`
        )
        .bind(
          record.sync_token || existing.sync_token,
          record.nickname || existing.nickname,
          nextVersion,
          record.client_version,
          record.snapshot_at,
          record.payload,
          record.size,
          now,
          record.app_id,
          userHash
        )
        .run();

      return { version: nextVersion, conflict: false, serverVersion: nextVersion };
    } else {
      const version = Math.max(1, record.version);
      await this.db
        .prepare(
          `INSERT INTO sync_snapshots
           (app_id, user_hash, sync_token, nickname, version, client_version, snapshot_at, payload, size, updated_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          record.app_id,
          userHash,
          record.sync_token,
          record.nickname,
          version,
          record.client_version,
          record.snapshot_at,
          record.payload,
          record.size,
          now,
          now
        )
        .run();

      return { version, conflict: false, serverVersion: version };
    }
  }

  async getSnapshotMeta(appId: string, userHash: string): Promise<{ version: number; snapshotAt: string; size: number } | null> {
    const row = await this.db
      .prepare('SELECT version, snapshot_at, size FROM sync_snapshots WHERE app_id = ? AND user_hash = ?')
      .bind(appId, userHash.toLowerCase())
      .first<{ version: number; snapshot_at: string; size: number }>();
    if (!row) return null;
    return {
      version: row.version,
      snapshotAt: row.snapshot_at,
      size: row.size
    };
  }

  async deleteUserData(appId: string, userHash: string): Promise<void> {
    const hash = userHash.toLowerCase();
    await this.db.batch([
      this.db.prepare('DELETE FROM sync_snapshots WHERE app_id = ? AND user_hash = ?').bind(appId, hash),
      this.db.prepare('DELETE FROM rank_scores WHERE app_id = ? AND user_hash = ?').bind(appId, hash)
    ]);
  }

  async listSnapshots(appId?: string, query?: string, limit = 50, offset = 0): Promise<{ list: SyncRecord[]; total: number }> {
    let whereClause = '1=1';
    const params: any[] = [];

    if (appId) {
      whereClause += ' AND app_id = ?';
      params.push(appId);
    }
    if (query) {
      whereClause += ' AND (user_hash LIKE ? OR nickname LIKE ?)';
      params.push(`%${query}%`, `%${query}%`);
    }

    const countRow = await this.db
      .prepare(`SELECT COUNT(*) as count FROM sync_snapshots WHERE ${whereClause}`)
      .bind(...params)
      .first<{ count: number }>();

    const rows = await this.db
      .prepare(
        `SELECT app_id, user_hash, '' as sync_token, nickname, version, client_version, snapshot_at, size, updated_at, created_at, SUBSTR(payload, 1, 100) as payload
         FROM sync_snapshots
         WHERE ${whereClause}
         ORDER BY updated_at DESC
         LIMIT ? OFFSET ?`
      )
      .bind(...params, limit, offset)
      .all<SyncRecord>();

    return {
      list: rows.results || [],
      total: countRow?.count || 0
    };
  }

  // ── Leaderboard Operations ──

  async submitScore(record: RankScoreRecord, sortOrder = 'desc'): Promise<{ rank: number; score: number; improved: boolean }> {
    const now = Date.now();
    const userHash = record.user_hash.toLowerCase();
    const existing = await this.db
      .prepare(
        `SELECT id, score, stars FROM rank_scores
         WHERE app_id = ? AND board_id = ? AND period = ? AND time_bucket = ? AND user_hash = ?`
      )
      .bind(record.app_id, record.board_id, record.period, record.time_bucket, userHash)
      .first<{ id: number; score: number; stars: number }>();

    let improved = false;
    if (existing) {
      const isBetter = sortOrder === 'asc' ? record.score < existing.score : record.score > existing.score;
      if (isBetter) {
        improved = true;
        await this.db
          .prepare(
            `UPDATE rank_scores
             SET score = ?, stars = ?, nickname = ?, extra_data = ?, publish_time = ?, updated_at = ?
             WHERE id = ?`
          )
          .bind(record.score, record.stars, record.nickname, record.extra_data, now, now, existing.id)
          .run();
      }
    } else {
      improved = true;
      await this.db
        .prepare(
          `INSERT INTO rank_scores
           (app_id, board_id, period, time_bucket, user_hash, nickname, score, stars, extra_data, publish_time, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          record.app_id,
          record.board_id,
          record.period,
          record.time_bucket,
          userHash,
          record.nickname,
          record.score,
          record.stars,
          record.extra_data,
          now,
          now
        )
        .run();
    }

    // 计算当前排名
    const rankInfo = await this.getUserRank(record.app_id, record.board_id, record.period, record.time_bucket, userHash, sortOrder);
    return {
      rank: rankInfo?.rank || 1,
      score: record.score,
      improved
    };
  }

  async queryRank(
    appId: string,
    boardId = 'total',
    period = 'all',
    timeBucket = 0,
    limit = 50,
    userHash?: string,
    sortOrder = 'desc'
  ): Promise<RankQueryResult> {
    const orderSql = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const rows = await this.db
      .prepare(
        `SELECT user_hash, nickname, score, stars, publish_time, extra_data
         FROM rank_scores
         WHERE app_id = ? AND board_id = ? AND period = ? AND time_bucket = ?
         ORDER BY score ${orderSql}, publish_time ASC
         LIMIT ?`
      )
      .bind(appId, boardId, period, timeBucket, limit)
      .all<{
        user_hash: string;
        nickname: string;
        score: number;
        stars: number;
        publish_time: number;
        extra_data: string;
      }>();

    const countRow = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM rank_scores
         WHERE app_id = ? AND board_id = ? AND period = ? AND time_bucket = ?`
      )
      .bind(appId, boardId, period, timeBucket)
      .first<{ count: number }>();

    const list = (rows.results || []).map((r, idx) => ({
      rank: idx + 1,
      userHash: r.user_hash,
      nickname: r.nickname,
      score: r.score,
      stars: r.stars,
      publishTime: r.publish_time,
      extraData: r.extra_data
    }));

    let userRankInfo: { rank: number; score: number; stars: number } | undefined;
    if (userHash) {
      userRankInfo = await this.getUserRank(appId, boardId, period, timeBucket, userHash.toLowerCase(), sortOrder) || undefined;
    }

    return {
      list,
      userRank: userRankInfo,
      totalCount: countRow?.count || 0
    };
  }

  async getUserRank(
    appId: string,
    boardId: string,
    period: string,
    timeBucket: number,
    userHash: string,
    sortOrder = 'desc'
  ): Promise<{ rank: number; score: number; stars: number } | null> {
    const hash = userHash.toLowerCase();
    const userRow = await this.db
      .prepare(
        `SELECT score, stars, publish_time FROM rank_scores
         WHERE app_id = ? AND board_id = ? AND period = ? AND time_bucket = ? AND user_hash = ?`
      )
      .bind(appId, boardId, period, timeBucket, hash)
      .first<{ score: number; stars: number; publish_time: number }>();

    if (!userRow) return null;

    const compOp = sortOrder === 'asc' ? '<' : '>';
    const betterCountRow = await this.db
      .prepare(
        `SELECT COUNT(*) as count FROM rank_scores
         WHERE app_id = ? AND board_id = ? AND period = ? AND time_bucket = ?
           AND (score ${compOp} ? OR (score = ? AND publish_time < ?))`
      )
      .bind(appId, boardId, period, timeBucket, userRow.score, userRow.score, userRow.publish_time)
      .first<{ count: number }>();

    return {
      rank: (betterCountRow?.count || 0) + 1,
      score: userRow.score,
      stars: userRow.stars
    };
  }

  async deleteRankEntry(id: number): Promise<void> {
    await this.db.prepare('DELETE FROM rank_scores WHERE id = ?').bind(id).run();
  }

  // ── Moderation & Stats ──

  async isUserBanned(userHash: string): Promise<boolean> {
    const row = await this.db
      .prepare('SELECT user_hash FROM banned_users WHERE user_hash = ?')
      .bind(userHash.toLowerCase())
      .first();
    return !!row;
  }

  async banUser(userHash: string, reason = ''): Promise<void> {
    await this.db
      .prepare('INSERT OR REPLACE INTO banned_users (user_hash, reason, created_at) VALUES (?, ?, ?)')
      .bind(userHash.toLowerCase(), reason, Date.now())
      .run();
  }

  async unbanUser(userHash: string): Promise<void> {
    await this.db.prepare('DELETE FROM banned_users WHERE user_hash = ?').bind(userHash.toLowerCase()).run();
  }

  async getStats(): Promise<SystemStats> {
    const snapshotsCount = await this.db.prepare('SELECT COUNT(*) as c FROM sync_snapshots').first<{ c: number }>();
    const rankCount = await this.db.prepare('SELECT COUNT(*) as c FROM rank_scores').first<{ c: number }>();
    const bannedCount = await this.db.prepare('SELECT COUNT(*) as c FROM banned_users').first<{ c: number }>();

    const appRows = await this.db
      .prepare('SELECT app_id, COUNT(*) as c FROM sync_snapshots GROUP BY app_id')
      .all<{ app_id: string; c: number }>();

    const appCounts: Record<string, number> = {};
    for (const r of appRows.results || []) {
      appCounts[r.app_id] = r.c;
    }

    return {
      totalSnapshots: snapshotsCount?.c || 0,
      totalRankScores: rankCount?.c || 0,
      totalBanned: bannedCount?.c || 0,
      appCounts
    };
  }
}
