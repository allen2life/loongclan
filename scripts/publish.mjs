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
    const transient = /TLS handshake timeout|i\/o timeout|connection reset|502|503|504|unexpected EOF|net\/http/i
      .test(String(e.stderr || e.message || ''));
    if (transient && attempt < 6) {
      const wait = Math.min(15000, 800 * Math.pow(2, attempt));
      console.log(`  … 网络抖动，${wait}ms 后重试 (${attempt + 1}/6)`);
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
  if (localPath.startsWith('website/')) return localPath.slice('website/'.length);
  return localPath;
}

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

  // 3) 基于远端现有树创建（base_tree 保留未在本地跟踪的文件，避免误删）
  const newTree = ghApi('POST', `repos/${OWNER}/${REPO}/git/trees`, {
    base_tree: headCommit.tree.sha,
    tree
  });
  console.log(`\n树已创建：${newTree.sha.slice(0, 8)}（${tree.length} 个条目）`);

  // 4) 创建提交
  const commit = ghApi('POST', `repos/${OWNER}/${REPO}/git/commits`, {
    message,
    tree: newTree.sha,
    parents: [headSha]
  });
  console.log(`提交已创建：${commit.sha.slice(0, 8)}`);

  // 5) 快进分支
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
