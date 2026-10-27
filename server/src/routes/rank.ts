import { Hono } from 'hono';
import { D1Store } from '../db/store.ts';
import {
  isValidHash,
  isValidKouling,
  deriveSyncToken,
  verifyKoulingMatch,
  verifyTokenMatch
} from '../auth/kouling.ts';
import { getClientIp, isValidAppId, isValidBoardId, RateLimiter, flag, num } from '../security/limits.ts';

type Bindings = {
  DB: D1Database;
  ALLOW_PLAINTEXT_KOULING?: string;
  RATE_LIMIT_SUBMIT_PER_MIN?: string;
  RANK_SUBMIT_MIN_INTERVAL_SEC?: string;
  RANK_MAX_ABS_SCORE?: string;
};

export const rankRoutes = new Hono<{ Bindings: Bindings }>();

/**
 * 计算基于北京时间（UTC+8）的时间槽编号
 */
function getTimeBucket(period: string, date = new Date()): number {
  if (period === 'all') return 0;

  // 转换为北京时间
  const utc = date.getTime() + date.getTimezoneOffset() * 60000;
  const beijingTime = new Date(utc + 3600000 * 8);

  const year = beijingTime.getFullYear();
  const month = String(beijingTime.getMonth() + 1).padStart(2, '0');
  const day = String(beijingTime.getDate()).padStart(2, '0');

  if (period === 'daily') {
    return parseInt(`${year}${month}${day}`, 10);
  }

  if (period === 'weekly') {
    const firstDayOfYear = new Date(beijingTime.getFullYear(), 0, 1);
    const pastDaysOfYear = (beijingTime.getTime() - firstDayOfYear.getTime()) / 86400000;
    const weekNum = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
    return parseInt(`${year}${String(weekNum).padStart(2, '0')}`, 10);
  }

  return 0;
}

// 1. 提交排行榜成绩 (Submit Score)
rankRoutes.post('/submit', async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ code: 400, err_code: 'bad_request', message: '请求体必须为合法 JSON' }, 400);
  }

  const {
    appId,
    boardId,
    period = 'all',
    userHash,
    syncToken,
    kouling,
    nickname,
    score,
    stars = 0,
    sortOrder = 'desc',
    extraData = ''
  } = body;

  if (!isValidAppId(appId)) {
    return c.json({ code: 400, err_code: 'missing_app_id', message: '缺少或非法 appId' }, 400);
  }
  if (!isValidBoardId(boardId)) {
    return c.json({ code: 400, err_code: 'missing_board_id', message: '缺少或非法 boardId' }, 400);
  }
  if (!userHash || typeof userHash !== 'string' || !isValidHash(userHash)) {
    return c.json({ code: 400, err_code: 'invalid_user_hash', message: 'userHash 格式不合法' }, 400);
  }
  if (typeof score !== 'number' || isNaN(score)) {
    return c.json({ code: 400, err_code: 'invalid_score', message: '成绩必须为有效数值' }, 400);
  }

  const normalizedHash = userHash.toLowerCase();
  const limiter = new RateLimiter(c.env.DB);

  // ── 风控 1：单 IP 每分钟提交上限 ──
  const ipMax = num(c.env.RATE_LIMIT_SUBMIT_PER_MIN, 20);
  const ipRes = await limiter.hit(`submit-ip:${getClientIp(c.req.raw.headers)}`, 60, ipMax);
  if (!ipRes.allowed) {
    return c.json({ code: 429, err_code: 'rate_limited', message: '提交过于频繁，请稍后再试' }, 429);
  }

  // ── 风控 2：同一 userHash 提交最小间隔 ──
  const minInterval = num(c.env.RANK_SUBMIT_MIN_INTERVAL_SEC, 5);
  const hashRes = await limiter.hit(`submit-hash:${normalizedHash}`, minInterval, 1);
  if (!hashRes.allowed) {
    return c.json(
      { code: 429, err_code: 'rate_limited', message: `同一账号提交间隔不得少于 ${minInterval} 秒` },
      429
    );
  }

  // ── 风控 3：极值上限阈值 (Sanity Bounds) ──
  const maxAbs = num(c.env.RANK_MAX_ABS_SCORE, 1_000_000_000);
  if (!Number.isFinite(score) || Math.abs(score) > maxAbs) {
    return c.json({ code: 400, err_code: 'score_out_of_bounds', message: '成绩超出合理阈值范围' }, 400);
  }

  // 鉴权密文解析：默认拒绝明文口令
  const allowPlaintext = flag(c.env.ALLOW_PLAINTEXT_KOULING, false);
  let effectiveToken = typeof syncToken === 'string' && isValidHash(syncToken) ? syncToken : '';

  if (kouling !== undefined && kouling !== null && kouling !== '') {
    if (!allowPlaintext) {
      return c.json(
        { code: 400, err_code: 'plaintext_kouling_rejected', message: '本服务绝不接收口令原文，请仅传输 syncToken 密文' },
        400
      );
    }
    if (!isValidKouling(kouling)) {
      return c.json({ code: 400, err_code: 'kouling_format', message: '口令格式有误' }, 400);
    }
    if (!verifyKoulingMatch(kouling, userHash)) {
      return c.json({ code: 401, err_code: 'hash_mismatch', message: '用户身份标识与口令不匹配' }, 401);
    }
    if (!effectiveToken) {
      effectiveToken = deriveSyncToken(kouling);
    }
  }

  // 防伪造：提交成绩必须持有私密鉴权密文
  if (!effectiveToken) {
    return c.json({ code: 401, err_code: 'missing_sync_token', message: '提交成绩必须携带 syncToken 鉴权密文' }, 401);
  }

  const store = new D1Store(c.env.DB);
  if (await store.isUserBanned(normalizedHash)) {
    return c.json({ code: 403, err_code: 'user_banned', message: '该账号已被限制上榜' }, 403);
  }

  // 防冒充：若用户已在云端绑定快照，校验其 syncToken 是否与快照记录一致
  const snapshot = await store.getSnapshot(appId, normalizedHash);
  if (snapshot && snapshot.sync_token && !verifyTokenMatch(snapshot.sync_token, effectiveToken)) {
    return c.json({ code: 401, err_code: 'token_mismatch', message: '鉴权密文与已绑定的云端记录不一致' }, 401);
  }

  const timeBucket = getTimeBucket(period);
  const result = await store.submitScore(
    {
      app_id: appId,
      board_id: boardId,
      period,
      time_bucket: timeBucket,
      user_hash: normalizedHash,
      nickname: String(nickname || '玩家').slice(0, 30),
      score: Math.floor(score),
      stars: Math.max(0, Math.min(5, Math.floor(stars || 0))),
      extra_data: typeof extraData === 'string' ? extraData : JSON.stringify(extraData),
      publish_time: Date.now()
    },
    sortOrder
  );

  return c.json({
    code: 0,
    message: 'ok',
    data: result
  });
});

// 2. 查询排行榜 (Query Leaderboard)
rankRoutes.get('/query', async (c) => {
  const appId = c.req.query('appId');
  const boardId = c.req.query('boardId') || 'total';
  const period = c.req.query('period') || 'all';
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));
  const userHash = c.req.query('userHash') || undefined;
  const sortOrder = c.req.query('sortOrder') === 'asc' ? 'asc' : 'desc';

  if (!isValidAppId(appId)) {
    return c.json({ code: 400, err_code: 'missing_app_id', message: '缺少 appId 参数' }, 400);
  }

  const timeBucket = getTimeBucket(period);
  const store = new D1Store(c.env.DB);
  const result = await store.queryRank(appId, boardId, period, timeBucket, limit, userHash, sortOrder);

  return c.json({
    code: 0,
    message: 'ok',
    data: result
  });
});
