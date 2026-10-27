#!/usr/bin/env node
/**
 * 龙族线上健康巡检 (Production Smoke Test)
 *
 * 用法：node scripts/smoke.mjs
 *
 * 校验项：
 *   1. 官网与中文站可达、关键内容存在
 *   2. 未知路径返回真实 404（而非软 404 首页）
 *   3. 静态资源（css/js/sitemap/robots）可达
 *   4. API 健康检查
 *   5. 零明文铁律：线上 API 必须拒绝 kouling 字段
 *   6. 端到端：上传 → 下载 → 排行 → 注销
 *
 * 退出码：0 全绿；1 存在失败项。
 */

import { createHash } from 'node:crypto';

const SITE = process.env.SITE_ORIGIN || 'https://loongclan.xyz';
const API = process.env.API_ORIGIN || 'https://api.loongclan.xyz';

const UA = 'LoongClan-SmokeTest/1.0 (+https://loongclan.xyz)';
let passed = 0;
let failed = 0;

function ok(name, cond, extra = '') {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}${extra ? ' — ' + extra : ''}`);
  } else {
    failed++;
    console.log(`  \u2717 ${name}${extra ? ' — ' + extra : ''}`);
  }
  return cond;
}

async function fetchText(url, opts = {}) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': UA, ...(opts.headers || {}) },
    signal: AbortSignal.timeout(20000),
    ...opts
  });
  const text = await res.text().catch(() => '');
  return { res, text };
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000)
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  return { res, json };
}

const sha = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('龙族线上巡检 · LoongClan Production Smoke Test');
  console.log(`站点：${SITE}    API：${API}`);
  console.log('═══════════════════════════════════════════════════════');

  // ── 1. 官网可达性 ──
  console.log('\n[1] 官网与语言版本');
  {
    const { res, text } = await fetchText(SITE + '/');
    ok('英文首页 200', res.status === 200, `status=${res.status}`);
    ok('英文首页含品牌名', /LoongClan/.test(text));
    ok('英文首页含 LoongPass 工具', /pass-k1/.test(text));
  }
  {
    const { res, text } = await fetchText(SITE + '/zh/');
    ok('中文首页 200', res.status === 200, `status=${res.status}`);
    ok('中文首页 lang=zh', /<html[^>]+lang="zh/.test(text));
  }

  // ── 2. 静态资源 ──
  console.log('\n[2] 静态资源');
  for (const p of ['/css/style.css', '/js/kouling-tool.js', '/js/main.js', '/robots.txt', '/sitemap.xml',
                   '/privacy.html', '/terms.html', '/zh/privacy.html', '/zh/terms.html']) {
    const { res } = await fetchText(SITE + p);
    ok(`${p} 可达`, res.status === 200, `status=${res.status}`);
  }

  // ── 3. 404 行为 ──
  console.log('\n[3] 404 兜底');
  {
    const { res } = await fetchText(SITE + '/this-path-should-not-exist-9f3a/');
    ok('未知路径返回 404', res.status === 404, `status=${res.status}`);
  }

  // ── 4. 死链检查（产品子域） ──
  console.log('\n[4] 产品子域可达性');
  for (const sub of ['https://xiangqi.loongclan.xyz/', 'https://hp.loongclan.xyz/']) {
    try {
      const { res } = await fetchText(sub);
      ok(sub + ' 可达', res.status === 200, `status=${res.status}`);
    } catch (e) {
      ok(sub + ' 可达', false, e.message);
    }
  }

  // ── 5. API 健康 ──
  console.log('\n[5] API 健康检查');
  {
    const { res, text } = await fetchText(API + '/health');
    ok('GET /health 200', res.status === 200, `status=${res.status}`);
    ok('/health 返回 ok', /"status"\s*:\s*"ok"/.test(text));
  }

  // ── 6. 零明文铁律 ──
  console.log('\n[6] 零明文铁律');
  {
    const kh = 'smoke.prb.001';
    const { res, json } = await postJson(API + '/api/v1/sync/upload', {
      appId: 'loongclan',
      kouling: kh,
      userHash: sha(kh + ':id'),
      syncToken: sha(kh + ':auth'),
      localVersion: 1,
      payload: {}
    });
    const isModern = json?.err_code === 'plaintext_kouling_rejected';
    ok(
      '线上 API 拒绝口令原文',
      isModern,
      isModern ? 'SHA-256 零明文版已上线' : `当前返回 ${json?.err_code || res.status}（仍是旧版，需部署）`
    );
  }

  // ── 7. 端到端 ──
  console.log('\n[7] 端到端同步与排行');
  const kouling = `smoke.${Date.now().toString(36).slice(-4)}.e2e`;
  const userHash = sha(kouling + ':id');
  const syncToken = sha(kouling + ':auth');
  {
    const up = await postJson(API + '/api/v1/sync/upload', {
      appId: 'loongclan',
      userHash,
      syncToken,
      nickname: 'SmokeTester',
      clientVersion: 'smoke',
      localVersion: 1,
      payload: { probe: true, at: Date.now() }
    });
    const modern = up.json?.code === 0;
    ok('上传快照', modern, modern ? `serverVersion=${up.json.data.serverVersion}` : `status=${up.res.status} ${up.json?.err_code || ''}`);
  }
  {
    const down = await postJson(API + '/api/v1/sync/download', { appId: 'loongclan', userHash, syncToken });
    ok('下载快照', down.json?.code === 0, `status=${down.res.status}`);
    ok('下载不含 sync_token', down.json?.data?.sync_token === undefined);
    ok('下载不含 kouling', down.json?.data?.kouling === undefined);
  }
  {
    const bad = await postJson(API + '/api/v1/sync/download', { appId: 'loongclan', userHash, syncToken: '0'.repeat(64) });
    ok('错误密文被拒绝', bad.res.status === 401, `status=${bad.res.status}`);
  }
  {
    const rk = await postJson(API + '/api/v1/rank/submit', {
      appId: 'loongclan', boardId: 'smoke', userHash, syncToken, nickname: 'SmokeTester', score: 42
    });
    ok('提交成绩', rk.json?.code === 0, `status=${rk.res.status}`);
  }
  {
    const q = await fetchText(`${API}/api/v1/rank/query?appId=loongclan&boardId=smoke&limit=10`);
    ok('查询排行榜', q.res.status === 200, `status=${q.res.status}`);
    ok('榜单不泄露 syncToken', !/sync_?token/i.test(q.text));
  }
  {
    const pg = await postJson(API + '/api/v1/sync/purge', {
      appId: 'loongclan', userHash, syncToken, confirm: 'DELETE_ALL_MY_DATA'
    });
    ok('注销抹除数据', pg.json?.code === 0, `status=${pg.res.status}`);
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`巡检完成：${passed} 项通过，${failed} 项失败。`);
  console.log('═══════════════════════════════════════════════════════');
  if (failed > 0) process.exit(1);
}

main().catch((e) => {
  console.error('巡检异常:', e);
  process.exit(1);
});
