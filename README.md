# 龙族 (LoongClan · loongclan.xyz) 统一平台

> **以中国文化传承传播为地基，以龙的传人（龙族，loongclan.xyz）为统一品牌和载体，构建面向单机小游戏与文化应用的超低成本通用服务底座。**

---

## 一、 开发运营铁律与核心哲学

为了达成所有小游戏、应用、网站的**超低运行成本（万级 DAU 成本低至 $0/月）**与**极致稳定性**，龙族生态所有产品严格恪守以下开发运营铁律：

1. ⚡ **纯单机可玩 / 离线优先（Local-First）**：
   所有游戏与应用均为纯前端单机可用。无网络也能完整畅玩，服务器故障绝不影响核心体验，彻底卸载服务器并发压力。
2. 🔑 **三维口令同步与隐私保密铁律（3-Part Passphrase & Privacy-First · 全生态强制遵循）**：
   统一采用三部分结构口令（`part1.part2.part3`，如 `loong.888.abc`、`诗藏.唐.001`）作为跨产品唯一身份识别依据。**零注册、免邮箱、免手机号、免密码**。
   - **三独立输入框与任意符号**：**前端口令输入框必须为三个独立的输入框**，严禁单框手动打点；每段 1~8 个字符**允许任意符号**（涵盖汉字、字母、数字、特殊符号及表情符），前端自动 Trim 去除首尾不可见空白，支持自动跳格、退格回退与一键智能粘贴分段；
   - **零明文交互铁律（双哈希派生 Dual-Hash）**：**口令原文 100% 留在前端客户端，绝对不向服务端传输，服务端零明文存储、零明文接收**！API 交互只传散列后的密文：`UserHash`（64位公开身份标识，用于排行榜与数据索引）与 `SyncToken`（64位私密鉴权密文，用于存档上传/下载校验，任何公开接口绝对不暴露）；
   - **标准 UTF-8 字节流编码铁律**：计算 `UserHash` 和 `SyncToken` 时，**必须统一使用标准 UTF-8 字节流（即 Web 端 `new TextEncoder().encode(kouling)`）**，以保证同一口令在任何设备、任何平台（iOS、Android、Windows、Linux、微信小游戏）上算出的 Hash 严格绝对一致；
   - **界面统一展示昵称**：**所有 loongclan 旗下的应用，常驻界面（顶栏、导航栏、排行榜、个人中心）严禁展示明文口令，界面上必须统一显示用户“昵称（Nickname）”**；
   - **脱敏显示部分（类似手机号码）**：在口令管理或凭据查看弹窗中，默认必须以类似手机号码脱敏的方式部分展示（如 `loong.***.***` 或 `part1.***.part3`），并配备眼睛图标显隐切换按钮与一键安全复制；
   - **智能输入保护**：口令输入框默认采用密码掩码（`type="password"`）保护，防止周围窥探或投屏录屏泄露。
3. 🛡️ **用户数据由用户做主（User Sovereignty · Obsidian 范式）**：
   本地 `localStorage` / `IndexedDB` 为唯一真相源。用户主动发起上传（Upload）与下载（Download），服务端仅作为透明可信中继层存储快照（Snapshot），不解释业务字段，支持一键全量导出与彻底注销。
4. 🌐 **通用的数据同步 API 后端（Generic Sync API）**：
   一套程序通用。既可作为 `loongclan.xyz` 的多租户中心服务（按 `app_id` 区分各产品如 `xiangqi`, `words`, `shizang`, `wenmai` 等），也可以每个应用独立架设后台运行。
5. 🏆 **通用的排行榜服务 API 后端（Generic Leaderboard API）**：
   一套程序通用。支持多应用、多关卡、多周期（总榜、日榜、周榜）成绩上报与极速 Top-N 排行查询。
6. 🌍 **UI 全面多语言，统一默认英语（Global English-First UI）**：
   旗下所有小游戏、应用、网站的界面交互 UI（按钮、弹窗、菜单、状态提示）统一支持多语言，且**默认语言统一为英语（English Default）**。不论应用自身的文化内核是什么（即使是古诗词《诗藏》、象棋《棋阵风暴》），外层交互框架一律以英语为默认呈现，并提供即时语言切换（如切换至简体中文），让全球用户零障碍领略华夏文化。

---

## 二、 技术选型与运行模式

- **线上极速边缘部署（\$0 / 月）**：
  - **核心计算**：Cloudflare Workers (Edge Serverless，全球 300+ 节点，0ms 冷启动)
  - **存储底座**：Cloudflare D1 (分布式 Serverless SQLite，强一致性，支持索引与原生 SQL 排序，每日 10 万次写入免费)
  - **静态门户**：Cloudflare Pages (全球免费 CDN)
  - **Web 框架**：[Hono](https://hono.dev/) (极轻量无依赖，专为边缘与标准 Fetch API 打造)
- **私有化与本地单机运行（同一套程序）**：
  - 支持直接在本地或 VPS 通过 Node.js (v22+) 原生运行，底层无缝挂载本地 `loongclan.db` 单文件 SQLite，提供与 Cloudflare D1 100% 相同的功能与接口。

---

## 三、 代码库全景目录

```
y:\sites\loongclan\
├── docs\                              # 平台技术规范与文档
│   ├── SPEC_IDENTITY.md               # 三维口令轻量身份体系算法规范 (TS/Go/C++ 实现)
│   ├── SPEC_SYNC.md                   # 通用数据同步协议规范 (Obsidian 范式快照)
│   ├── SPEC_RANK.md                   # 通用排行榜协议规范 (日榜/周榜/多维度)
│   └── DEPLOYMENT.md                  # 部署指南 (Cloudflare Workers 与独立私有化)
├── sdk\                               # 客户端通用 SDK
│   └── ts\                            # TypeScript SDK
│       ├── LoongIdentity.ts           # 口令校验、生成与 FNV-1a 哈希计算
│       ├── LoongSyncClient.ts         # 数据上传、下载、元数据比对、导出与注销
│       ├── LoongRankClient.ts         # 成绩上传与排行榜查询客户端
│       ├── types.ts                   # 共享类型定义
│       └── index.ts                   # SDK 总导出
├── server\                            # 通用后端服务 (Hono + D1 / 本地 SQLite)
│   ├── src\
│   │   ├── auth\kouling.ts            # 服务端口令验证与哈希校验
│   │   ├── db\schema.sql              # D1 / SQLite 统一建表 SQL
│   │   ├── db\store.ts                # 统一数据库访问层
│   │   ├── routes\sync.ts             # 通用同步 API (/api/v1/sync/*)
│   │   ├── routes\rank.ts             # 通用排行榜 API (/api/v1/rank/*)
│   │   ├── routes\admin.ts            # 管理控制台接口 (/api/admin/*)
│   │   ├── index.ts                   # Workers 入口与嵌入式管理界面
│   │   └── node.ts                    # 本地独立模式服务器入口
│   ├── test\                          # 自动化测试套件 (全链路 34 项测试通过)
│   ├── wrangler.jsonc                 # Cloudflare 配置文件
│   └── package.json
└── website\                           # 龙族官网门户 (loongclan.xyz)
    ├── index.html                     # 英文官网
    ├── zh\index.html                  # 中文官网
    ├── css\style.css                  # 东方美学高定暗调样式
    ├── js\
    │   ├── main.js                    # 响应式导航与微动效
    │   └── kouling-tool.js            # 网页端三维通行证生成与换算工具
    ├── img\                           # 视觉资产与徽标
    ├── robots.txt
    └── sitemap.xml
```

---

## 四、 快速上手

### 1. 客户端接入 SDK
在小游戏（Web、微信小游戏、WASM、React/Vue）中引入 `sdk/ts`：

```typescript
import { LoongIdentity, LoongSyncClient, LoongRankClient } from './sdk/ts';

// 1. 口令校验与生成
const kouling = LoongIdentity.generateRandom('loong'); // 如 'loong.9x8a.m2b4'
const userHash = LoongIdentity.koulingToHash(kouling);

// 2. 数据快照上传 (主动备份)
const syncClient = new LoongSyncClient('https://api.loongclan.xyz');
await syncClient.uploadSnapshot({
  appId: 'words',
  userHash,
  kouling,
  nickname: '诗眼破壁人',
  localVersion: 1,
  payload: { won: 10, streak: 3, solved: ['sz-001'] }
});

// 3. 提交与查询全服榜单
const rankClient = new LoongRankClient('https://api.loongclan.xyz');
await rankClient.submitScore({
  appId: 'words',
  boardId: 'daily_20260909',
  period: 'daily',
  userHash,
  kouling,
  nickname: '诗眼破壁人',
  score: 980
});
```

### 2. 服务端本地运行 (零配置)
```bash
cd server
npm run dev           # 使用 wrangler 本地模拟运行
# 或直接原生 Node 启动独立服务器:
node --experimental-strip-types src/node.ts
```
访问 `http://localhost:8787/admin/` 即可进入内置的**龙族控制台**。

### 3. 服务端线上发布 (Cloudflare)
```bash
cd server
wrangler d1 execute loongclan_db --remote --file=src/db/schema.sql
wrangler deploy
```

---

## 五、 产品矩阵一览

- **《棋阵风暴》(Xiangqi Blast)**：象棋战术与星宿残局单机策略（[xiangqi.loongclan.xyz](https://xiangqi.loongclan.xyz/)）
- **《诗藏》(Shizang)**：经典诗词炼字与推敲解谜（[words.loongclan.xyz/?mode=shizang](https://words.loongclan.xyz/?mode=shizang)）
- **《文脉》(Wenmai)**：华夏文化意象连线与归纳（[words.loongclan.xyz/?mode=wenmai](https://words.loongclan.xyz/?mode=wenmai)）
- **龙族通行证 (LoongPass)**：跨应用三维口令离线通行工具（集成于 [loongclan.xyz](https://loongclan.xyz/) 官网首页）
