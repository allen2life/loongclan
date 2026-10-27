/**
 * 历史数据库迁移回归测试 (Schema Migration Regression)
 *
 * 背景：线上 D1 是早期建表，sync_snapshots 缺 9 列、rank_scores 缺 updated_at。
 * 该漂移曾导致上传快照 500、刷新成绩 500。
 *
 * 本测试构造一份「旧表结构」内存库，执行 D1Store.ensureColumns()，
 * 断言缺失列被补齐、且原本失败的写入可以成功。
 */

import { DatabaseSync } from 'node:sqlite';
import { D1Store } from '../src/db/store.ts';

let passed = 0;
let failed = 0;

function assert(cond: boolean, msg: string) {
  if (cond) {
    passed++;
    console.log(`  ✓ [PASS] ${msg}`);
  } else {
    failed++;
    console.log(`  ✕ [FAIL] ${msg}`);
  }
}

// ── 最小 D1 适配层 ──
class Stmt {
  db: DatabaseSync;
  sql: string;
  args: any[];
  constructor(db: DatabaseSync, sql: string, args: any[] = []) {
    this.db = db;
    this.sql = sql;
    this.args = args;
  }
  bind(...args: any[]) {
    return new Stmt(this.db, this.sql, args);
  }
  async all() {
    return { results: this.db.prepare(this.sql).all(...this.args), success: true };
  }
  async first() {
    return this.db.prepare(this.sql).get(...this.args) ?? null;
  }
  async run() {
    return { success: true, meta: this.db.prepare(this.sql).run(...this.args) };
  }
}
class Db {
  db: DatabaseSync;
  constructor(db: DatabaseSync) {
    this.db = db;
  }
  prepare(sql: string) {
    return new Stmt(this.db, sql);
  }
}

function columnsOf(db: DatabaseSync, table: string): Set<string> {
  return new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((r: any) => String(r.name)));
}

async function run() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('历史库迁移回归测试 · Schema Migration Regression');
  console.log('═══════════════════════════════════════════════════════\n');

  // ── 构造「线上旧表结构」：只有最小列 ──
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE sync_snapshots (
      app_id TEXT NOT NULL,
      user_hash TEXT NOT NULL,
      payload TEXT NOT NULL DEFAULT '{}',
      PRIMARY KEY (app_id, user_hash)
    );
    CREATE TABLE rank_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      app_id TEXT NOT NULL,
      board_id TEXT NOT NULL,
      period TEXT NOT NULL DEFAULT 'all',
      time_bucket INTEGER NOT NULL DEFAULT 0,
      user_hash TEXT NOT NULL,
      nickname TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL DEFAULT 0,
      stars INTEGER NOT NULL DEFAULT 0,
      extra_data TEXT NOT NULL DEFAULT '',
      publish_time INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT 0,
      UNIQUE(app_id, board_id, period, time_bucket, user_hash)
    );
  `);

  console.log('[1] 迁移前状态');
  {
    const snapCols = columnsOf(db, 'sync_snapshots');
    const rankCols = columnsOf(db, 'rank_scores');
    assert(!snapCols.has('sync_token'), '迁移前 sync_snapshots 缺 sync_token');
    assert(!snapCols.has('version'), '迁移前 sync_snapshots 缺 version');
    assert(!rankCols.has('updated_at'), '迁移前 rank_scores 缺 updated_at');
  }

  console.log('\n[2] 执行 ensureColumns()');
  {
    const store = new D1Store(new Db(db) as any);
    await store.ensureColumns();
    assert(true, 'ensureColumns() 执行未抛异常');
  }

  console.log('\n[3] 迁移后列已补齐');
  {
    const snapCols = columnsOf(db, 'sync_snapshots');
    for (const c of ['sync_token', 'nickname', 'version', 'client_version', 'snapshot_at', 'payload', 'size', 'updated_at', 'created_at']) {
      assert(snapCols.has(c), `sync_snapshots.${c} 已补齐`);
    }
    const rankCols = columnsOf(db, 'rank_scores');
    assert(rankCols.has('updated_at'), 'rank_scores.updated_at 已补齐');
  }

  console.log('\n[4] 迁移后写入成功（复现原 500 场景）');
  {
    let ok = true;
    try {
      db.prepare(`INSERT INTO sync_snapshots
        (app_id,user_hash,sync_token,nickname,version,client_version,snapshot_at,payload,size,updated_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
        .run('words', 'hash1', 'tok1', 'nick', 1, 'v1', '2026-01-01T00:00:00Z', '{}', 2, 1, 1);
    } catch {
      ok = false;
    }
    assert(ok, '旧库迁移后可正常 INSERT 快照');

    let rankOk = true;
    try {
      db.prepare(`INSERT INTO rank_scores (app_id,board_id,period,time_bucket,user_hash,nickname,score,stars,extra_data,publish_time,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run('words', 'b', 'all', 0, 'hash1', 'nick', 10, 0, '', 1, 1, 1);
      db.prepare(`UPDATE rank_scores SET score=?, updated_at=? WHERE id=?`).run(20, 2, 1);
    } catch {
      rankOk = false;
    }
    assert(rankOk, '旧库迁移后可正常 UPDATE 成绩（原 500 场景）');
  }

  console.log('\n[5] 幂等性：重复执行不报错');
  {
    const store = new D1Store(new Db(db) as any);
    let threw = false;
    try {
      await store.ensureColumns();
      await store.ensureColumns();
    } catch {
      threw = true;
    }
    assert(!threw, 'ensureColumns() 可重复执行且幂等');
  }

  console.log('\n═══════════════════════════════════════════════════════');
  console.log(`测试完成：${passed} 项通过，${failed} 项失败。`);
  console.log('═══════════════════════════════════════════════════════');
  if (failed > 0) process.exit(1);
}

run().catch((e) => {
  console.error('测试异常:', e);
  process.exit(1);
});
