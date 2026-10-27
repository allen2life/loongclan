/**
 * Cloudflare Pages 边缘拦截器 (_worker.js)
 *
 * 背景：本仓库的历史布局把整个仓库根目录当作站点发布过，导致
 * README.md、server/、docs/、scripts/、sdk/ 等源码成为可公开下载的
 * 静态资源。虽然发布目录已收窄为 website/，但边缘仍残留着旧的缓存/资产，
 * 且 `_redirects` 不支持返回 404（Cloudflare 仅允许 301/302/307/308），
 * 因此需要在这里做确定性拦截。
 *
 * 该 Worker 在所有请求最前端执行：命中黑名单立即返回 404，
 * 其余请求原样交给静态资源层 (env.ASSETS)，不影响站点正常功能。
 */

// 绝不对外提供的路径前缀
const BLOCKED_PREFIXES = [
  '/docs/',
  '/server/',
  '/sdk/',
  '/scripts/',
  '/.github/',
  '/website/',
  '/node_modules/'
];

// 绝不对外提供的具体文件
const BLOCKED_EXACT = new Set([
  '/README.md',
  '/readme.md',
  '/package.json',
  '/package-lock.json',
  '/tsconfig.json',
  '/.gitignore',
  '/wrangler.jsonc',
  '/wrangler.toml'
]);

function isBlocked(pathname) {
  // 归一化：去掉尾部斜杠差异、解码百分号编码，防止绕过
  let p = pathname;
  try {
    p = decodeURIComponent(p);
  } catch {
    /* 非法编码，按原样处理 */
  }
  p = p.toLowerCase();

  if (BLOCKED_EXACT.has(p)) return true;
  if (BLOCKED_EXACT.has(p.replace(/\/+$/, ''))) return true;

  for (const prefix of BLOCKED_PREFIXES) {
    if (p.startsWith(prefix)) return true;
  }

  // 常见源码/配置文件扩展名，出现在任何位置都拒绝
  if (/\.(ts|tsx|mjs|sql|jsonc|toml|lock)$/.test(p)) return true;

  return false;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (isBlocked(url.pathname)) {
      return new Response(
        JSON.stringify({ code: 404, err_code: 'not_found', message: 'Not Found' }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
            'X-Robots-Tag': 'noindex'
          }
        }
      );
    }

    const response = await env.ASSETS.fetch(request);

    // 安全响应头兜底（_headers 已覆盖主要路径，这里防止遗漏）
    const headers = new Headers(response.headers);
    if (!headers.has('X-Content-Type-Options')) headers.set('X-Content-Type-Options', 'nosniff');
    if (!headers.has('X-Frame-Options')) headers.set('X-Frame-Options', 'SAMEORIGIN');
    if (!headers.has('Referrer-Policy')) headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
