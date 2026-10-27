import { Hono } from 'hono';
import { D1Store } from '../db/store.ts';
import {
  isValidHash,
  isValidKouling,
  deriveSyncToken,
  verifyKoulingMatch,
  verifyTokenMatch
} from '../auth/kouling.ts';
import { getClientIp, isValidAppId, RateLimiter, flag, num } from '../security/limits.ts';

type Bindings = {
  DB: D1Database;
  ALLOW_PLAINTEXT_KOULING?: string;
  RATE_LIMIT_SYNC_PER_MIN?: string;
};

export const syncRoutes = new Hono<{ Bindings: Bindings }>();

type AuthErr = { code: number; err_code: string; message: string; status: 400 | 401 };

/**
 * 解析请求中的鉴权密文。
 * 铁律：口令原文绝不接收。默认拒绝任何 `kouling` 字段，
 * 仅在显式开启 ALLOW_PLAINTEXT_KOULING=true 的临时过渡期才接受，且仅在内存中派生，绝不落库。
 */
function resolveToken(env: any, body: any): { token: string; err?: AuthErr } {
  const { syncToken, kouling, userHash } = body;
  const allowPlaintext = flag(env.ALLOW_PLAINTEXT_KOULING, false);

  if (kouling !== undefined && kouling !== null && kouling !== '') {
    if (!allowPlaintext) {
      return {
        token: '',
        err: {
          code: 400,
          err_code: 'plaintext_kouling_rejected',
          message: '本服务绝不接收口令原文，请仅传输 syncToken 密文',
          status: 400
        }
      };
    }
    if (!isValidKouling(kouling)) {
      return { token: '', err: { code: 400, err_code: 'kouling_format', message: '口令格式有误', status: 400 } };
    }
    if (userHash && !verifyKoulingMatch(kouling, userHash)) {
      return { token: '', err: { code: 401, err_code: 'hash_mismatch', message: '用户身份标识与口令不匹配', status: 401 } };
    }
    return { token: deriveSyncToken(kouling) };
  }

  if (typeof syncToken === 'string' && isValidHash(syncToken)) {
    return { token: syncToken };
  }

  return {
    token: '',
    err: { code: 400, err_code: 'missing_sync_token', message: '缺少鉴权密文 syncToken', status: 400 }
  };
}

/** 同步接口统一限流（按 IP） */
async function guardRate(c: any): Promise<Response | null> {
  const limiter = new RateLimiter(c.env.DB);
  const max = num(c.env.RATE_LIMIT_SYNC_PER_MIN, 60);
  const ip = getClientIp(c.req.raw.headers);
  const r = await limiter.hit(`sync:${ip}`, 60, max);
  if (!r.allowed) {
    return c.json({ code: 429, err_code: 'rate_limited', message: '请求过于频繁，请稍后再试' }, 429);
  }
  return null;
}

// 1. 上传数据快照 (Upload Snapshot)
syncRoutes.post('/upload', async (c) => {
  const limited = await guardRate(c);
  if (limited) return limited;

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ code: 400, err_code: 'bad_request', message: '请求体必须为合法 JSON' }, 400);
  }

  const { appId, userHash, nickname, clientVersion, snapshotAt, localVersion, force, payload } = body;

  if (!isValidAppId(appId)) {
    return c.json({ code: 400, err_code: 'missing_app_id', message: '缺少或非法 appId (1-32 位字母数字_-)' }, 400);
  }

  // 校验 userHash (必须为 64 位十六进制)
  if (!userHash || typeof userHash !== 'string' || !isValidHash(userHash)) {
    return c.json({ code: 400, err_code: 'invalid_user_hash', message: 'userHash 格式不合法 (需为 64 位十六进制)' }, 400);
  }

  const auth = resolveToken(c.env, body);
  if (auth.err) {
    return c.json({ code: auth.err.code, err_code: auth.err.err_code, message: auth.err.message }, auth.err.status);
  }
  const effectiveToken = auth.token;
  const normalizedHash = userHash.toLowerCase();

  const store = new D1Store(c.env.DB);
  if (await store.isUserBanned(normalizedHash)) {
    return c.json({ code: 403, err_code: 'user_banned', message: '该账号已被限制同步' }, 403);
  }

  // 检查已有记录的鉴权密文绑定
  const existing = await store.getSnapshot(appId, normalizedHash);
  if (existing && existing.sync_token && !verifyTokenMatch(existing.sync_token, effectiveToken)) {
    return c.json({ code: 401, err_code: 'token_mismatch', message: '鉴权密文与已绑定的云端记录不一致' }, 401);
  }

  // 乐观锁版本冲突判定 (若未开启 force 且云端版本已大于本地版本)
  const incomingLocalVersion = Number(localVersion) || 0;
  if (!force && existing && existing.version > incomingLocalVersion) {
    return c.json(
      {
        code: 409,
        err_code: 'version_conflict',
        message: '服务器版本更新，请先拉取最新快照进行合并',
        data: {
          conflict: true,
          serverVersion: existing.version,
          serverSnapshotAt: existing.snapshot_at
        }
      },
      409
    );
  }

  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {});
  const payloadSize = new TextEncoder().encode(payloadStr).length;

  // 单快照体积上限 1 MiB，防止无限制占用存储
  if (payloadSize > 1024 * 1024) {
    return c.json({ code: 413, err_code: 'payload_too_large', message: '快照数据超过 1MiB 上限' }, 413);
  }

  // 确定目标版本号
  const targetVersion = force
    ? ((existing?.version || 0) + 1)
    : Math.max((existing?.version || 0) + 1, incomingLocalVersion || 1);

  const result = await store.saveSnapshot({
    app_id: appId,
    user_hash: normalizedHash,
    sync_token: effectiveToken.toLowerCase(),
    nickname: (nickname || existing?.nickname || '').slice(0, 30),
    version: targetVersion,
    client_version: clientVersion || '',
    snapshot_at: snapshotAt || new Date().toISOString(),
    payload: payloadStr,
    size: payloadSize,
    updated_at: Date.now()
  });

  return c.json({
    code: 0,
    message: 'ok',
    data: {
      serverVersion: result.version,
      savedAt: new Date().toISOString(),
      conflict: false
    }
  });
});

// 2. 下载数据快照 (Download Snapshot)
syncRoutes.post('/download', async (c) => {
  const limited = await guardRate(c);
  if (limited) return limited;

  const body = await c.req.json().catch(() => null);
  if (!body) {
    return c.json({ code: 400, err_code: 'bad_request', message: '请求体必须为合法 JSON' }, 400);
  }

  const { appId, userHash } = body;
  if (!isValidAppId(appId) || !userHash || typeof userHash !== 'string' || !isValidHash(userHash)) {
    return c.json({ code: 400, err_code: 'bad_request', message: '缺少合法参数 appId 或 userHash' }, 400);
  }

  const auth = resolveToken(c.env, body);
  if (auth.err) {
    return c.json({ code: auth.err.code, err_code: auth.err.err_code, message: auth.err.message }, auth.err.status);
  }

  const store = new D1Store(c.env.DB);
  const snapshot = await store.getSnapshot(appId, userHash.toLowerCase());
  if (!snapshot) {
    return c.json({ code: 404, err_code: 'no_snapshot', message: '云端暂无此口令的历史快照' }, 404);
  }

  if (snapshot.sync_token && !verifyTokenMatch(snapshot.sync_token, auth.token)) {
    return c.json({ code: 401, err_code: 'token_mismatch', message: '鉴权密文与已绑定的云端记录不一致' }, 401);
  }

  let parsedPayload: any;
  try {
    parsedPayload = JSON.parse(snapshot.payload);
  } catch {
    parsedPayload = snapshot.payload;
  }

  return c.json({
    code: 0,
    message: 'ok',
    data: {
      appId: snapshot.app_id,
      userHash: snapshot.user_hash,
      nickname: snapshot.nickname,
      serverVersion: snapshot.version,
      snapshotAt: snapshot.snapshot_at,
      payload: parsedPayload
    }
  });
});

// 3. 查询快照元数据 (Snapshot Metadata)
syncRoutes.all('/meta', async (c) => {
  let appId = c.req.query('appId');
  let userHash = c.req.query('userHash');
  const syncTokenQuery = c.req.query('syncToken');

  if (!appId || !userHash) {
    const body = await c.req.json().catch(() => ({}));
    appId = appId || body.appId;
    userHash = userHash || body.userHash;
  }

  if (!isValidAppId(appId) || !userHash || !isValidHash(userHash)) {
    return c.json({ code: 400, err_code: 'bad_request', message: '缺少合法 appId 或 userHash' }, 400);
  }

  // 元数据接口同样需要鉴权，避免第三方探测某口令是否在用云端
  const store = new D1Store(c.env.DB);
  const record = await store.getSnapshot(appId, userHash.toLowerCase());
  if (!record) {
    return c.json({ code: 404, err_code: 'no_snapshot', message: '未找到对应元信息' }, 404);
  }

  const auth = resolveToken(c.env, { syncToken: syncTokenQuery });
  if (auth.err || !verifyTokenMatch(record.sync_token, auth.token)) {
    return c.json({ code: 401, err_code: 'token_mismatch', message: '鉴权密文不匹配' }, 401);
  }

  return c.json({
    code: 0,
    message: 'ok',
    data: {
      serverVersion: record.version,
      snapshotAt: record.snapshot_at,
      size: record.size
    }
  });
});

// 4. 全量数据导出 (Export User Data)
syncRoutes.post('/export', async (c) => {
  const limited = await guardRate(c);
  if (limited) return limited;

  const body = await c.req.json().catch(() => null);
  const { appId, userHash } = body || {};

  if (!isValidAppId(appId) || !userHash || !isValidHash(userHash)) {
    return c.json({ code: 400, err_code: 'bad_request', message: '缺少合法参数' }, 400);
  }

  const auth = resolveToken(c.env, body);
  if (auth.err) {
    return c.json({ code: auth.err.code, err_code: auth.err.err_code, message: auth.err.message }, auth.err.status);
  }

  const store = new D1Store(c.env.DB);
  const snapshot = await store.getSnapshot(appId, userHash.toLowerCase());
  if (!snapshot) {
    return c.json({ code: 404, err_code: 'no_snapshot', message: '无数据' }, 404);
  }

  if (snapshot.sync_token && !verifyTokenMatch(snapshot.sync_token, auth.token)) {
    return c.json({ code: 401, err_code: 'token_mismatch', message: '鉴权密文不匹配' }, 401);
  }

  // 导出时排除私密鉴权密文，保护凭证安全
  const { sync_token: _excluded, ...safeRecord } = snapshot;

  return c.json({
    code: 0,
    message: 'ok',
    data: {
      exportedAt: new Date().toISOString(),
      record: safeRecord
    }
  });
});

// 5. 永久注销与数据抹除 (Purge User Data)
syncRoutes.post('/purge', async (c) => {
  const limited = await guardRate(c);
  if (limited) return limited;

  const body = await c.req.json().catch(() => null);
  const { appId, userHash, confirm } = body || {};

  if (confirm !== 'DELETE_ALL_MY_DATA') {
    return c.json({ code: 400, err_code: 'confirmation_required', message: '必须传入 confirm 确认标识 DELETE_ALL_MY_DATA' }, 400);
  }

  if (!isValidAppId(appId) || !userHash || !isValidHash(userHash)) {
    return c.json({ code: 400, err_code: 'bad_request', message: '缺少合法参数' }, 400);
  }

  const auth = resolveToken(c.env, body);
  if (auth.err) {
    return c.json({ code: auth.err.code, err_code: auth.err.err_code, message: auth.err.message }, auth.err.status);
  }

  const store = new D1Store(c.env.DB);
  const snapshot = await store.getSnapshot(appId, userHash.toLowerCase());
  if (snapshot && snapshot.sync_token && !verifyTokenMatch(snapshot.sync_token, auth.token)) {
    return c.json({ code: 401, err_code: 'token_mismatch', message: '鉴权密文不匹配' }, 401);
  }

  await store.deleteUserData(appId, userHash.toLowerCase());

  return c.json({
    code: 0,
    message: '数据已永久抹除'
  });
});
