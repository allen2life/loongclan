# 龙族通用技术规范：平台部署指南 (DEPLOYMENT)

**版本**：v1.0.0  
**核心目标**：实现 **\$0 / 月极低成本上线** 与 **零外部依赖独立自建（本地/私有云）** 双轨并行。

---

## 模式一：Cloudflare 边缘无服务器部署（推荐 · \$0/月）

依托 Cloudflare 全球 300+ 边缘节点，享受免运维、自动扩缩容、零冷启动与免费全球 SSL/CDN。

### 1.1 架构拓扑
- **统一官网门户**：Cloudflare Pages 静态托管（域名：`loongclan.xyz`）
- **通用 API 后端**：Cloudflare Workers（域名：`api.loongclan.xyz`）
- **数据持久层**：Cloudflare D1（分布式 Serverless SQLite，数据库名：`loongclan_db`）

### 1.2 准备工作
确保已安装 Node.js (v18+) 及 Cloudflare CLI 工具 `wrangler`：
```bash
npm install -g wrangler
wrangler login
```

### 1.3 初始化 D1 数据库
1. 创建 D1 数据库：
   ```bash
   wrangler d1 create loongclan_db
   ```
   终端会输出如下信息：
   ```json
   {
     "binding": "DB",
     "database_name": "loongclan_db",
     "database_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
   }
   ```
2. 将得到的 `database_id` 填入 `server/wrangler.jsonc` 的 `d1_databases` 对应配置中。

3. 执行建表脚本：
   ```bash
   cd server
   # 线上执行
   wrangler d1 execute loongclan_db --remote --file=./src/db/schema.sql
   # 本地开发测试执行
   wrangler d1 execute loongclan_db --local --file=./src/db/schema.sql
   ```

### 1.4 设置环境变量与密钥
在 `server` 目录下配置管理后台访问凭据与允许跨域来源：
```bash
wrangler secret put ADMIN_KEY
# 输入你的管理后台主密钥/密码
```

### 1.5 部署 Workers API
```bash
cd server
npm run deploy
```

### 1.6 部署官网 (Cloudflare Pages)
在 Cloudflare 控制台新建 Pages 项目，连接代码仓库并设置发布目录为 `website`；或直接使用命令行发布：
```bash
wrangler pages deploy website --project-name=loongclan-website
```

---

## 模式二：独立私有化部署（Docker / VPS / 单机本地 SQLite）

适用于小游戏作者希望完全自主托管专属数据后端、或者在离线私有网络中独立运行的场景。

### 2.1 本地或 VPS Node/Bun 单机运行
服务基于 Hono 编写，提供对标准本地 SQLite（`better-sqlite3` 或内置轻量驱动）的直接适配：
```bash
cd server
npm install
npm run build:node
npm run start:node
```
此时服务将监听 `0.0.0.0:8787`，并在当前目录自动生成 `loongclan.db` 单文件数据库。

### 2.2 Docker 一键部署
项目提供微型 Dockerfile：
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
COPY admin ./admin
RUN npm run build:node

FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/admin ./admin
ENV PORT=8080
ENV SQLITE_PATH=/data/loongclan.db
VOLUME /data
EXPOSE 8080
CMD ["node", "dist/node.js"]
```

使用 Docker 运行：
```bash
docker build -t loongclan-server .
docker run -d -p 8080:8080 -v $(pwd)/data:/data --name loongclan-api loongclan-server
```

### 2.3 Nginx 反向代理配置示例
```nginx
server {
    listen 80;
    server_name api.loongclan.xyz;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
