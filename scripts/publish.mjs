#!/usr/bin/env node
/**
 * 通过 GitHub Git Data API 发布整个仓库（单次提交）。
 * 绕开被网络阻断的 git 传输协议（github.com:443 git-upload-pack 超时）。
 *
 * 用法：
 *   node scripts/publish.mjs                    # 使用默认提交信息
 *   node scripts/publish.mjs "feat: xxx"
 *   node scripts/publish.mjs --dry-run          # 仅列出将发布的文件
 *
 * 依赖：gh CLI 已登录（gh auth token 可用）
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const OWNER = 'allen2life';
const REPO = 'loongclan';
const BRANCH = 'main';

const dryRun = process.argv.includes('--dry-run');
const message = process.argv.slice(2).filter((a) => !a.startsWith('--'))[0] || 'Sync workspace → GitHub';

function ghApi(method, path, body, attempt = 0) {
  const args = ['api', '--method', method, path];
  const opts = { encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 };
  if (body !== undefined) {
    args.push('--input', '-');
    opts.input = JSON.stringify(body);
  }
  try {
    const out = execFileSync('gh', args, opts);
    return out.trim() ? JSON.parse(out) : {};
  } catch (e) {
    const msg = String(e.stderr || e.message || '');
    const transient = /TLS handshake timeout|i\/o timeout|connection reset|502|503|504|unexpected EOF|net\/http/i.test(msg)
      // GitHub 的 git-data 对象存在最终一致性延迟：刚创建的 tree/commit 可能短暂 422/404
      || (/Tree SHA does not exist|Object does not exist|Not Found|\(HTTP 422\)|\(HTTP 404\)/i.test(msg)
          && /git\/(trees|commits|refs)/i.test(path));
    if (transient && attempt < 8) {
      const wait = Math.min(20000, 1000 * Math.pow(1.8, attempt));
      console.log(`  … 等待对象传播，${wait}ms 后重试 (${attempt + 1}/8)`);
      execFileSync('sleep', [String(wait / 1000)]);
      return ghApi(method, path, body, attempt + 1);
    }
    throw e;
  }
}

/**
 * 远端路径映射：
 *   远端仓库历史上采用「根目录即站点」的扁平布局。
 *   本地规范布局为 website/ 子目录，因此发布时把 website/* 提升到仓库根。
 *   其余目录（server/ sdk/ docs/ scripts/ .github/）保持原样。
 */
function mapRemotePath(localPath) {
  // 保持仓库真实结构。禁止把 website/ 提升到根目录——
  // 否则任何「发布仓库根目录」的工作流都会把 server/ docs/ 源码泄露到公网。
  return localPath;
}

/** 轮询直到对象可稳定读取（应对 GitHub git-data 的最终一致性） */
async function waitFor(fn, label, tries = 10) {
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i === tries - 1) throw e;
      const wait = Math.min(8000, 500 * Math.pow(1.6, i));
      console.log(`  … 等待 ${label} 可用，${Math.round(wait)}ms (${i + 1}/${tries})`);
      execFileSync('sleep', [String(wait / 1000)]);
    }
  }
}

/**
 * 需要从远端删除的历史文件。
 *
 * 这些是早期「仓库根目录即站点」布局留下的静态资源。新布局把站点放在
 * website/ 下，发布范围收窄为 website/，因此根目录副本必须清除，
 * 否则 Cloudflare Pages 仍会以仓库根为源对外暴露整仓文件。
 */
const REMOTE_DELETE = [
  'index.html', '404.html', 'privacy.html', 'terms.html',
  'robots.txt', 'sitemap.xml',
  'css', 'js', 'img', 'zh'
];
function listTrackedFiles() {
  const out = execFileSync('git', ['ls-files'], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean);
}

function isTextPath(p) {
  return /\.(ts|tsx|js|mjs|cjs|json|jsonc|md|css|html|xml|txt|yml|yaml|sql|toml|svg|sh)$/i.test(p);
}

async function main() {
  const files = listTrackedFiles();
  console.log(`仓库：${OWNER}/${REPO}@${BRANCH}`);
  console.log(`待发布文件：${files.length}\n`);

  if (dryRun) {
    for (const f of files) console.log('  ' + f);
    return;
  }

  // 1) 取当前分支头
  const ref = ghApi('GET', `repos/${OWNER}/${REPO}/git/ref/heads/${BRANCH}`);
  const headSha = ref.object.sha;
  const headCommit = ghApi('GET', `repos/${OWNER}/${REPO}/git/commits/${headSha}`);
  console.log(`当前 HEAD：${headSha.slice(0, 8)} — ${headCommit.message.split('\n')[0]}`);

  // 2) 为每个文件创建 blob
  const tree = [];
  let uploaded = 0;
  let skippedMissing = 0;

  for (const [i, f] of files.entries()) {
    const abs = join(process.cwd(), f);
    let buf;
    try {
      statSync(abs);
      buf = readFileSync(abs);
    } catch {
      console.log(`  ! 跳过（本地缺失）: ${f}`);
      skippedMissing++;
      continue;
    }

    const blob = ghApi('POST', `repos/${OWNER}/${REPO}/git/blobs`, {
      content: buf.toString('base64'),
      encoding: 'base64'
    });

    tree.push({
      path: mapRemotePath(f),
      mode: '100644',
      type: 'blob',
      sha: blob.sha
    });
    uploaded++;
    if ((i + 1) % 10 === 0 || i + 1 === files.length) {
      console.log(`  已上传 ${i + 1}/${files.length}`);
    }
  }

  // 3) 清理根目录历史残留（sha: null 表示从树中删除该路径）
  const remoteRoot = ghApi('GET', `repos/${OWNER}/${REPO}/git/trees/${headCommit.tree.sha}`);
  const rootPaths = new Set((remoteRoot.tree || []).map((e) => e.path));
  let removed = 0;
  for (const p of REMOTE_DELETE) {
    if (rootPaths.has(p)) {
      tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
      removed++;
      console.log(`  − 删除根目录残留: ${p}`);
    }
  }
  if (removed === 0) console.log('  （无根目录残留需清理）');

  // 4) 基于远端现有树创建（base_tree 保留未在本地跟踪的文件，避免误删）
  const newTree = ghApi('POST', `repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree
  });
  console.log(`\n树已创建：${newTree.sha.slice(0, 8)}（${tree.length} 个条目）`);

  // 5) 等待 tree 可被引用（GitHub git-data 存在最终一致性延迟）
  await waitFor(() => ghApi('GET', `repos/${OWNER}/${REPO}/git/trees/${newTree.sha}`), 'tree');

  // 6) 创建提交
  const commit = ghApi('POST', `repos/${OWNER}/${REPO}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [headSha]
  });
  console.log(`提交已创建：${commit.sha.slice(0, 8)}`);

  // 7) 等待 commit 可被引用，再快进分支
  await waitFor(() => ghApi('GET', `repos/${OWNER}/${REPO}/git/commits/${commit.sha}`), 'commit');
  ghApi('PATCH', `repos/${OWNER}/${REPO}/git/refs/heads/${BRANCH}`, {
    sha: commit.sha,
    force: false
  });

  console.log(`\n✅ 已推送到 ${OWNER}/${REPO}@${BRANCH}`);
  console.log(`   上传 ${uploaded} 个文件，跳过 ${skippedMissing} 个`);
  console.log(`   https://github.com/${OWNER}/${REPO}/commit/${commit.sha}`);
}

main().catch((e) => {
  console.error('发布失败:', e.stderr || e.message || e);
  process.exit(1);
});
