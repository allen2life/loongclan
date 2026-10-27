/**
 * _worker.js 边缘拦截逻辑单元测试
 *
 * 验证源码路径拦截规则：既要挡住所有敏感路径，
 * 又不能误伤正常的站点资源（否则站点会白屏）。
 *
 * 运行：node test/worker.test.mjs
 */

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
    console.log(`  ✓ [PASS] ${msg}`);
  } else {
    failed++;
    console.log(`  ✕ [FAIL] ${msg}`);
  }
}

// 从 _worker.js 中抽取被挡/放行的判定逻辑（与实现保持一致）
const BLOCKED_PREFIXES = ['/docs/', '/server/', '/sdk/', '/scripts/', '/.github/', '/website/', '/node_modules/'];
const BLOCKED_EXACT = new Set([
  '/readme.md', '/package.json', '/package-lock.json', '/tsconfig.json',
  '/.gitignore', '/wrangler.jsonc', '/wrangler.toml'
]);

function isBlocked(pathname) {
  let p = pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* ignore */
  }
  p = p.toLowerCase();
  if (BLOCKED_EXACT.has(p)) return true;
  if (BLOCKED_EXACT.has(p.replace(/\/+$/, ''))) return true;
  for (const prefix of BLOCKED_PREFIXES) {
    if (p.startsWith(prefix)) return true;
  }
  if (/\.(ts|tsx|mjs|sql|jsonc|toml|lock)$/.test(p)) return true;
  return false;
}

console.log('═══════════════════════════════════════════════════════');
console.log('Pages 边缘拦截器测试 · _worker.js guard');
console.log('═══════════════════════════════════════════════════════\n');

console.log('[1] 必须拦截的敏感路径');
for (const p of [
  '/README.md', '/package.json', '/package-lock.json', '/.gitignore',
  '/docs/SPEC_IDENTITY.md', '/docs/OPERATIONS_PLAN.md',
  '/server/src/auth/kouling.ts', '/server/wrangler.jsonc',
  '/scripts/publish.mjs', '/scripts/smoke.mjs',
  '/sdk/ts/LoongIdentity.ts', '/.github/workflows/deploy-web.yml',
  '/website/index.html', '/tsconfig.json', '/wrangler.toml',
  '/server/src/db/schema.sql'
]) {
  assert(isBlocked(p), `拦截 ${p}`);
}

console.log('\n[2] 绕过尝试也必须拦截');
for (const p of [
  '/README.MD',                    // 大小写
  '/README.md/',                   // 尾斜杠
  '/%52EADME.md',                  // 百分号编码
  '/docs/../README.md',            // 路径穿越的原文（边缘会先归一化，双保险）
  '/Server/src/auth/kouling.ts',   // 大小写目录
  '/sdk/ts/index.ts'
]) {
  assert(isBlocked(p), `拦截绕过变体 ${p}`);
}

console.log('\n[3] 正常站点资源不得误伤');
for (const p of [
  '/', '/zh/', '/index.html', '/zh/index.html',
  '/css/style.css', '/js/main.js', '/js/kouling-tool.js',
  '/img/logo_loongclan.png', '/img/favicon.svg',
  '/privacy', '/terms', '/zh/privacy', '/zh/terms',
  '/404.html', '/robots.txt', '/sitemap.xml',
  '/manifest.webmanifest'
]) {
  assert(!isBlocked(p), `放行 ${p}`);
}

console.log('\n═══════════════════════════════════════════════════════');
console.log(`测试完成：${passed} 项通过，${failed} 项失败。`);
console.log('═══════════════════════════════════════════════════════');
if (failed > 0) process.exit(1);
