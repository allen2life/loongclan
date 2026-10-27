import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from '../src/index.ts';
import {
  deriveUserHash,
  deriveSyncToken,
  isValidKouling,
  mask,
  cleanInput
} from '../src/auth/kouling.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── 1. 创建 Node 原生 SQLite 内存数据库作为 D1 Mock ──
const sqlite = new DatabaseSync(':memory:');
const schemaSql = readFileSync(resolve(__dirname, '../src/db/schema.sql'), 'utf-8');
sqlite.exec(schemaSql);

class D1PreparedStatementMock {
  db: DatabaseSync;
  sql: string;
  args: any[];

  constructor(db: DatabaseSync, sql: string, args: any[] = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }

  bind(...args: any[]) {
    return new D1PreparedStatementMock(this.db, this.sql, args);
  }

  async all() {
    const stmt = this.db.prepare(this.sql);
    const results = stmt.all(...this.args);
    return { results, success: true };
  }

  async first(col?: string) {
    const stmt = this.db.prepare(this.sql);
    const row = stmt.get(...this.args) as any;
    if (!row) return null;
    if (col && typeof row === 'object') return row[col];
    return row;
  }

  async run() {
    const stmt = this.db.prepare(this.sql);
    const info = stmt.run(...this.args);
    return { success: true, meta: info };
  }
}

class D1DatabaseMock {
  db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }

  prepare(sql: string) {
    return new D1PreparedStatementMock(this.db, sql);
  }

  async batch(stmts: D1PreparedStatementMock[]) {
    const results = [];
    for (const s of stmts) {
      results.push(await s.run());
    }
    return results;
  }
}

const mockEnv = {
  DB: new D1DatabaseMock(sqlite) as any,
  ADMIN_KEY: 'test_admin_key',
  ADMIN_USERNAME: 'admin',
  ALLOWED_ORIGINS: '*'
};

console.log('═══════════════════════════════════════════════════════');
console.log('      龙族 (LoongClan) 统一后端 API 全链路单元测试      ');
console.log('  基于 SPEC_IDENTITY, SPEC_SYNC, SPEC_RANK, SPEC_I18N   ');
console.log('═══════════════════════════════════════════════════════');

let passed = 0;
let failed = 0;

function assert(condition: boolean, msg: string) {
  if (condition) {
    console.log(`  ✓ [PASS] ${msg}`);
    passed++;
  } else {
    console.error(`  ✕ [FAIL] ${msg}`);
    failed++;
  }
}

async function runTests() {
  // Test 1: 健康检查
  {
    const res = await app.request('/health', {}, mockEnv);
    assert(res.status === 200, 'GET /health 应返回 200');
    const data = await res.json() as any;
    assert(data.status === 'ok', 'health status 应为 ok');
  }

  // Test 2: SPEC_IDENTITY v1.1.0 算法规范验证 (SHA-256 Dual-Hash)
  {
    const k1 = 'loong.888.abc';
    const u1 = deriveUserHash(k1);
    const t1 = deriveSyncToken(k1);

    assert(u1.length === 64, 'UserHash 长度必须为 64 位十六进制');
    assert(t1.length === 64, 'SyncToken 长度必须为 64 位十六进制');
    assert(u1 !== t1, '域隔离保证 UserHash 与 SyncToken 互不相同且不可推导');

    // 中文口令与 Emoji 口令测试
    const kChinese = '诗藏.唐.001';
    const kEmoji = '🐉.888.⚔️';
    assert(isValidKouling(kChinese), '允许中文汉字口令');
    assert(isValidKouling(kEmoji), '允许 Emoji 表情口令');
    assert(!isValidKouling('toolongchunk12345.888.abc'), '单段超过8字符应拒绝');
    assert(!isValidKouling('part1..part3'), '空段应拒绝');

    // 脱敏回显与清洗
    assert(mask(k1) === 'loong.***.abc', '口令脱敏默认中间段掩码');
    assert(mask(kChinese) === '诗藏.***.001', '中文口令脱敏格式正确');
    assert(cleanInput('  loong。888·abc  ') === 'loong.888.abc', '智能输入清洗转换全角符号');
  }

  // Test 3: 零明文数据快照上传 (POST /api/v1/sync/upload 仅传 userHash + syncToken)
  const testKouling = 'loong.888.abc';
  const testUserHash = deriveUserHash(testKouling);
  const testSyncToken = deriveSyncToken(testKouling);

  {
    const uploadReq = {
      appId: 'words',
      userHash: testUserHash,
      syncToken: testSyncToken,
      nickname: '测试诗仙',
      localVersion: 1,
      snapshotAt: '2026-09-10T00:00:00Z',
      payload: { solved: ['wm-001'], streak: 3 }
    };

    const res = await app.request('/api/v1/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadReq)
    }, mockEnv);

    assert(res.status === 200, '首次上传快照 (userHash + syncToken) 应返回 200');
    const json = await res.json() as any;
    assert(json.code === 0, '返回 code 应为 0');
    assert(json.data?.serverVersion === 1, '首个版本号应为 1');
    assert(json.data?.conflict === false, '无冲突标记');
  }

  // Test 4: 版本递增上传 (第二次正常同步)
  {
    const uploadReq2 = {
      appId: 'words',
      userHash: testUserHash,
      syncToken: testSyncToken,
      nickname: '测试诗仙',
      localVersion: 2,
      payload: { solved: ['wm-001', 'wm-002'], streak: 4 }
    };

    const res = await app.request('/api/v1/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(uploadReq2)
    }, mockEnv);

    assert(res.status === 200, '正常更新快照应返回 200');
    const json = await res.json() as any;
    assert(json.data?.serverVersion === 2, '版本号应递增至 2');
  }

  // Test 5: 鉴权密文不匹配防御 (冒用他人的 userHash 但持有错误 syncToken)
  {
    const fakeReq = {
      appId: 'words',
      userHash: testUserHash,
      syncToken: '0000000000000000000000000000000000000000000000000000000000000000',
      nickname: '冒名者',
      localVersion: 3,
      payload: { hacked: true }
    };

    const res = await app.request('/api/v1/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fakeReq)
    }, mockEnv);

    assert(res.status === 401, '错误 syncToken 上传应拒绝 (401)');
    const json = await res.json() as any;
    assert(json.err_code === 'token_mismatch', '错误码应为 token_mismatch');
  }

  // Test 6: 乐观锁冲突检测 (使用旧版本尝试上传)
  {
    const staleReq = {
      appId: 'words',
      userHash: testUserHash,
      syncToken: testSyncToken,
      localVersion: 1, // 云端已经是 2
      payload: { solved: [] }
    };

    const res = await app.request('/api/v1/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(staleReq)
    }, mockEnv);

    assert(res.status === 409, '旧版本上传应触发 409 冲突');
    const json = await res.json() as any;
    assert(json.data?.conflict === true, 'conflict 字段应为 true');
    assert(json.data?.serverVersion === 2, '返回最新的云端版本 2');
  }

  // Test 7: 下载快照 (POST /api/v1/sync/download 仅需 userHash + syncToken)
  {
    const downloadReq = {
      appId: 'words',
      userHash: testUserHash,
      syncToken: testSyncToken
    };

    const res = await app.request('/api/v1/sync/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(downloadReq)
    }, mockEnv);

    assert(res.status === 200, '下载快照应返回 200');
    const json = await res.json() as any;
    assert(json.data?.serverVersion === 2, '下载版本应为 2');
    assert(json.data?.payload?.streak === 4, '下载 payload 数据应完整还原');
    assert(json.data?.sync_token === undefined, '响应中绝不泄露 sync_token');
    assert(json.data?.kouling === undefined, '响应中绝不泄露 kouling');
  }

  // Test 8: 快照元数据检查 (GET /api/v1/sync/meta) — 必须携带鉴权密文
  {
    const noAuth = await app.request(`/api/v1/sync/meta?appId=words&userHash=${testUserHash}`, {}, mockEnv);
    assert(noAuth.status === 401, '无鉴权密文查询元数据必须被拒绝 (401)');

    const res = await app.request(
      `/api/v1/sync/meta?appId=words&userHash=${testUserHash}&syncToken=${testSyncToken}`,
      {},
      mockEnv
    );
    assert(res.status === 200, '查询元数据应返回 200');
    const json = await res.json() as any;
    assert(json.data?.serverVersion === 2, '元数据版本应为 2');
    assert(json.data?.size > 0, '元数据大小应大于 0');
  }

  // Test 9: 通用排行榜提交与防伪造测试
  const user1 = 'player.one.111';
  const hash1 = deriveUserHash(user1);
  const token1 = deriveSyncToken(user1);

  const user2 = 'player.two.222';
  const hash2 = deriveUserHash(user2);
  const token2 = deriveSyncToken(user2);

  {
    // 用户 1 提交 1000 分
    const sub1 = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: 'words',
        boardId: 'total',
        period: 'all',
        userHash: hash1,
        syncToken: token1,
        nickname: '玩家一号',
        score: 1000,
        stars: 3
      })
    }, mockEnv);

    assert(sub1.status === 200, '用户1提交成绩应返回 200');
    const json1 = await sub1.json() as any;
    assert(json1.data?.rank === 1, '用户1当前排名应为 #1');

    // 用户 2 提交 1500 分 (超越用户 1)
    const sub2 = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: 'words',
        boardId: 'total',
        period: 'all',
        userHash: hash2,
        syncToken: token2,
        nickname: '玩家二号',
        score: 1500,
        stars: 5
      })
    }, mockEnv);

    assert(sub2.status === 200, '用户2提交成绩应返回 200');
    const json2 = await sub2.json() as any;
    assert(json2.data?.rank === 1, '用户2高分跃居 #1');

    // 查询全服榜单
    const qRes = await app.request(`/api/v1/rank/query?appId=words&boardId=total&period=all&userHash=${hash1}`, {}, mockEnv);
    assert(qRes.status === 200, '查询排行榜应返回 200');
    const qJson = await qRes.json() as any;
    assert(qJson.data?.list?.length === 2, '榜单共有 2 名玩家');
    assert(qJson.data?.list[0]?.userHash === hash2, '第一名应为用户2 (1500分)');
    assert(qJson.data?.list[0]?.nickname === '玩家二号', '第一名昵称为玩家二号');
    assert(qJson.data?.list[1]?.userHash === hash1, '第二名应为用户1 (1000分)');
    assert(qJson.data?.userRank?.rank === 2, '查询者用户1自身排名应为 #2');
    assert(qJson.data?.list[0]?.syncToken === undefined, '榜单公开数据严禁暴露 syncToken');
  }

  // Test 10: 防冒充测试 (若已有存档，用错误 syncToken 提交排行应拒绝)
  {
    const spoofReq = {
      appId: 'words',
      boardId: 'total',
      userHash: testUserHash, // 已在 Test 3 上传过存档
      syncToken: '1111111111111111111111111111111111111111111111111111111111111111',
      nickname: '冒充测试诗仙',
      score: 99999
    };

    const res = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(spoofReq)
    }, mockEnv);

    assert(res.status === 401, '冒用已有快照用户的 Hash 提交虚假成绩应被拦截 (401)');
    const json = await res.json() as any;
    assert(json.err_code === 'token_mismatch', '拦截错误码应为 token_mismatch');
  }

  // Test 11: 数据导出与永久抹除 (SPEC_SYNC 用户数据主权)
  {
    // 导出数据
    const expRes = await app.request('/api/v1/sync/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: 'words',
        userHash: testUserHash,
        syncToken: testSyncToken
      })
    }, mockEnv);

    assert(expRes.status === 200, '用户导出数据应返回 200');
    const expJson = await expRes.json() as any;
    assert(expJson.data?.record?.user_hash === testUserHash, '导出数据归属正确');
    assert(expJson.data?.record?.sync_token === undefined, '导出数据不含私密鉴权密文');

    // 永久注销与抹除
    const purgeRes = await app.request('/api/v1/sync/purge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: 'words',
        userHash: testUserHash,
        syncToken: testSyncToken,
        confirm: 'DELETE_ALL_MY_DATA'
      })
    }, mockEnv);

    assert(purgeRes.status === 200, '永久抹除数据应返回 200');

    // 再次下载应返回 404
    const checkDl = await app.request('/api/v1/sync/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId: 'words',
        userHash: testUserHash,
        syncToken: testSyncToken
      })
    }, mockEnv);
    assert(checkDl.status === 404, '抹除后下载应返回 404 no_snapshot');
  }

  // Test 12: 管理后台登录与控制台
  {
    // 错误密码
    const badLogin = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'wrong' })
    }, mockEnv);
    assert(badLogin.status === 401, '错误密码应拒绝登录 (401)');

    // 正确密码
    const okLogin = await app.request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: 'test_admin_key' })
    }, mockEnv);
    assert(okLogin.status === 200, '正确密码应允许登录 (200)');
    const loginJson = await okLogin.json() as any;
    const token = loginJson.data?.token;

    // 带 Token 访问统计数据
    const statsRes = await app.request('/api/admin/stats', {
      headers: { 'Authorization': `Bearer ${token}` }
    }, mockEnv);
    assert(statsRes.status === 200, '带鉴权访问 /api/admin/stats 应返回 200');
    const statsJson = await statsRes.json() as any;
    assert(statsJson.data?.totalRankScores >= 2, '统计排行记录数应至少为 2');

    // 访问管理控制台静态页面
    const adminPage = await app.request('/admin/', {}, mockEnv);
    assert(adminPage.status === 200, '访问 /admin/ 应返回 200 页面');
    const html = await adminPage.text();
    assert(html.includes('龙族控制台'), 'HTML 应包含管理后台标题');
  }

  // Test 16: 零明文铁律 — 默认必须拒绝任何口令原文
  {
    const kh = 'plain.prb.xyz';
    const h = deriveUserHash(kh);
    const t = deriveSyncToken(kh);

    const rejected = await app.request('/api/v1/sync/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'words', kouling: kh, userHash: h, syncToken: t, localVersion: 1, payload: {} })
    }, mockEnv);
    assert(rejected.status === 400, '传输口令原文必须被拒绝');
    const rejJson = await rejected.json() as any;
    assert(rejJson.err_code === 'plaintext_kouling_rejected', '拒绝错误码应为 plaintext_kouling_rejected');

    const rankRejected = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'words', boardId: 'plain', kouling: kh, userHash: h, score: 10 })
    }, mockEnv);
    assert(rankRejected.status === 400, '排行榜传输口令原文同样必须被拒绝');
  }

  // Test 17: 排行榜提交必须携带鉴权密文
  {
    const kh = 'no.tok.probe';
    const h = deriveUserHash(kh);
    const res = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'words', boardId: 'notoken', userHash: h, score: 50 })
    }, mockEnv);
    assert(res.status === 401, '无 syncToken 提交成绩必须被拒绝 (401)');
    const json = await res.json() as any;
    assert(json.err_code === 'missing_sync_token', '错误码应为 missing_sync_token');
  }

  // Test 18: 极值上限阈值 (Sanity Bounds)
  {
    const kh = 'bounds.probe.zz';
    const h = deriveUserHash(kh);
    const t = deriveSyncToken(kh);
    const res = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'words', boardId: 'bounds', userHash: h, syncToken: t, score: 9e12 })
    }, mockEnv);
    assert(res.status === 400, '超出阈值的成绩必须被拒绝');
    const json = await res.json() as any;
    assert(json.err_code === 'score_out_of_bounds', '错误码应为 score_out_of_bounds');
  }

  // Test 19: 同一 userHash 提交最小间隔限流
  {
    const kh = 'interval.probe.qq';
    const h = deriveUserHash(kh);
    const t = deriveSyncToken(kh);
    const body = JSON.stringify({ appId: 'words', boardId: 'interval', userHash: h, syncToken: t, score: 11 });

    const first = await app.request('/api/v1/rank/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    }, mockEnv);
    assert(first.status === 200, '首次提交应成功');

    const second = await app.request('/api/v1/rank/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body
    }, mockEnv);
    assert(second.status === 429, '间隔不足的重复提交应被限流 (429)');
    const json = await second.json() as any;
    assert(json.err_code === 'rate_limited', '错误码应为 rate_limited');
  }

  // Test 20: 非法 appId / boardId 必须被拒绝
  {
    const kh = 'appid.probe.zz';
    const h = deriveUserHash(kh);
    const t = deriveSyncToken(kh);
    const badApp = await app.request('/api/v1/sync/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: '../../etc/passwd', userHash: h, syncToken: t })
    }, mockEnv);
    assert(badApp.status === 400, '非法 appId 必须被拒绝');

    const badBoard = await app.request('/api/v1/rank/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ appId: 'words', boardId: '', userHash: h, syncToken: t, score: 1 })
    }, mockEnv);
    assert(badBoard.status === 400, '非法 boardId 必须被拒绝');
  }

  console.log('───────────────────────────────────────────────────────');
  console.log(`测试完成：${passed} 项通过，${failed} 项失败。`);
  console.log('═══════════════════════════════════════════════════════');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('测试运行异常:', err);
  process.exit(1);
});
