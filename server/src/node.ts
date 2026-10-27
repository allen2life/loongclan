/**
 * 本地独立运行与自建部署入口 (Standalone Node.js Server with Local SQLite)
 * 纯 Node.js 原生运行，无任何额外运行环境依赖。
 */

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import app from './index.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const port = parseInt(process.env.PORT || '8787', 10);
const dbPath = process.env.SQLITE_PATH || resolve(process.cwd(), 'loongclan.db');
const adminKey = process.env.ADMIN_KEY || 'loongclan_admin_888';

console.log(`[LoongClan Server] 初始化本地 SQLite: ${dbPath}`);
const sqlite = new DatabaseSync(dbPath);

// 执行自动建表
const schemaPath = resolve(__dirname, 'db/schema.sql');
if (existsSync(schemaPath)) {
  const schemaSql = readFileSync(schemaPath, 'utf-8');
  sqlite.exec(schemaSql);
  console.log('[LoongClan Server] 数据表结构检查与初始化完成');
}

// 包装 Node 原生 SQLite 为 D1 兼容接口
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

const env = {
  DB: new D1DatabaseMock(sqlite) as any,
  ADMIN_KEY: adminKey,
  ADMIN_USERNAME: process.env.ADMIN_USERNAME || 'admin',
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || '*'
};

const server = createServer(async (req, res) => {
  try {
    const protocol = req.headers['x-forwarded-proto'] || 'http';
    const host = req.headers.host || `localhost:${port}`;
    const url = `${protocol}://${host}${req.url}`;

    // 读取请求体 Buffer
    let bodyBuffer: Buffer | null = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const chunks: Buffer[] = [];
      for await (const chunk of req) {
        chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
      }
      bodyBuffer = Buffer.concat(chunks);
    }

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) {
          value.forEach(v => headers.append(key, v));
        } else {
          headers.set(key, value);
        }
      }
    }

    const webReq = new Request(url, {
      method: req.method,
      headers,
      body: bodyBuffer
    });

    const webRes = await app.fetch(webReq, env);

    res.statusCode = webRes.status;
    webRes.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const ab = await webRes.arrayBuffer();
    res.end(Buffer.from(ab));
  } catch (err: any) {
    console.error('Server error:', err);
    res.statusCode = 500;
    res.end(JSON.stringify({ code: 500, message: 'Internal Server Error' }));
  }
});

server.listen(port, () => {
  console.log(`═══════════════════════════════════════════════════════`);
  console.log(`  🐉 龙族 (LoongClan) 通用平台服务已就绪 (Node.js 独立模式)`);
  console.log(`  - 服务监听端口: http://localhost:${port}`);
  console.log(`  - 管理控制台:   http://localhost:${port}/admin/`);
  console.log(`  - 默认管理密码: ${adminKey}`);
  console.log(`═══════════════════════════════════════════════════════`);
});
