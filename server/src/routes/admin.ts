import { Hono } from 'hono';
import { D1Store } from '../db/store.ts';

type Bindings = {
  DB: D1Database;
  ADMIN_KEY?: string;
  ADMIN_USERNAME?: string;
};

export const adminRoutes = new Hono<{ Bindings: Bindings }>();

// 简单 Admin 鉴权中间件
adminRoutes.use('*', async (c, next) => {
  if (c.req.path.endsWith('/login')) {
    return next();
  }

  const authHeader = c.req.header('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : c.req.header('X-Admin-Token');
  const expectedKey = c.env.ADMIN_KEY || 'loongclan_admin_888';

  if (!token || token !== expectedKey) {
    return c.json({ code: 401, err_code: 'unauthorized', message: '管理员未认证或 Token 无效' }, 401);
  }

  await next();
});

// 管理员登录
adminRoutes.post('/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { username, password } = body;
  const expectedUser = c.env.ADMIN_USERNAME || 'admin';
  const expectedKey = c.env.ADMIN_KEY || 'loongclan_admin_888';

  if (password === expectedKey && (!username || username === expectedUser)) {
    return c.json({
      code: 0,
      message: 'ok',
      data: {
        token: expectedKey,
        username: expectedUser,
        expiresAt: Date.now() + 86400000 * 7
      }
    });
  }

  return c.json({ code: 401, err_code: 'invalid_credentials', message: '账号或密码错误' }, 401);
});

// 平台数据总览
adminRoutes.get('/stats', async (c) => {
  const store = new D1Store(c.env.DB);
  const stats = await store.getStats();
  return c.json({ code: 0, data: stats });
});

// 同步快照列表与搜索
adminRoutes.get('/sync/list', async (c) => {
  const appId = c.req.query('appId') || undefined;
  const q = c.req.query('q') || undefined;
  const page = Math.max(1, parseInt(c.req.query('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '30', 10)));
  const offset = (page - 1) * limit;

  const store = new D1Store(c.env.DB);
  const result = await store.listSnapshots(appId, q, limit, offset);

  return c.json({
    code: 0,
    data: {
      list: result.list,
      total: result.total,
      page,
      limit
    }
  });
});

// 删除快照
adminRoutes.post('/sync/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { appId, userHash } = body;
  if (!appId || !userHash) {
    return c.json({ code: 400, message: '缺少参数' }, 400);
  }

  const store = new D1Store(c.env.DB);
  await store.deleteUserData(appId, userHash);
  return c.json({ code: 0, message: '删除成功' });
});

// 排行榜列表与审查
adminRoutes.get('/rank/list', async (c) => {
  const appId = c.req.query('appId') || 'xiangqi';
  const boardId = c.req.query('boardId') || 'level_0';
  const period = c.req.query('period') || 'all';
  const limit = Math.min(100, Math.max(1, parseInt(c.req.query('limit') || '50', 10)));

  const store = new D1Store(c.env.DB);
  const result = await store.queryRank(appId, boardId, period, 0, limit);

  return c.json({ code: 0, data: result });
});

// 移除作弊上榜条目
adminRoutes.post('/rank/delete', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { id } = body;
  if (!id) return c.json({ code: 400, message: '缺少 id' }, 400);

  const store = new D1Store(c.env.DB);
  await store.deleteRankEntry(Number(id));
  return c.json({ code: 0, message: '移除成功' });
});

// 封禁违规用户 Hash
adminRoutes.post('/user/ban', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { userHash, reason } = body;
  if (!userHash) return c.json({ code: 400, message: '缺少 userHash' }, 400);

  const store = new D1Store(c.env.DB);
  await store.banUser(userHash, reason || '违规作弊');
  return c.json({ code: 0, message: '封禁成功' });
});

// 解封用户 Hash
adminRoutes.post('/user/unban', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const { userHash } = body;
  if (!userHash) return c.json({ code: 400, message: '缺少 userHash' }, 400);

  const store = new D1Store(c.env.DB);
  await store.unbanUser(userHash);
  return c.json({ code: 0, message: '解封成功' });
});
