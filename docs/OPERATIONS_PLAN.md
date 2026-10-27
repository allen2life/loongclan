# 龙族（loongclan.xyz）研发计划 · OPERATIONS_PLAN

> 版本：v1.0.0 · 制定日期：2026-10-27
> 目标：让 loongclan.xyz 成为**可完整上线、自动运行**的龙族品牌官网与产品聚集地。

---

## 0. 当前状态盘点（Baseline）

| 资产 | 状态 | 说明 |
| :--- | :--- | :--- |
| `loongclan.xyz` 官网（英/中双语） | ✅ 在线 | Cloudflare Pages，项目名 `loongclan` |
| `api.loongclan.xyz` 通用 API | ✅ 在线（已升级） | 已部署 SHA-256 零明文版；拒绝明文口令、限流、极值阈值全部生效 |
| `xiangqi.loongclan.xyz` 棋阵风暴 | ✅ 在线 | 独立 Pages 项目 `xiangqiblast` |
| `hp.loongclan.xyz` 半纸诗声 | ✅ 在线 | 独立 Pages 项目 `recite` |
| `words.loongclan.xyz` 诗藏 / 文脉 | 🚧 未部署 | 无 DNS、无 Pages 项目；官网已改为「研发中」禁用态，死链清零 |
| 团队协作 | ✅ 已接管 | 本地 git 仓库 + GitHub Actions 全自动发布 |

---

## 1. 研发计划（R&D Roadmap）

### P0 · 上线阻塞项（本轮必须完成）

1. **修复官网死链**：`words.loongclan.xyz` 无部署，所有指向它的入口必须改为「研发中」禁用态，避免用户点了 404。
2. **打通后端自动发布**：新增 GitHub Actions 工作流，把仓库中已加固的 SHA-256 版 API 部署到 `api.loongclan.xyz`。
3. **补齐风控**：实现 SPEC_RANK §3 承诺的限流与极值阈值，消除「文档承诺、代码缺失」的落差。
4. **关闭明文后门**：服务端默认拒绝任何 `kouling` 字段，落实 P0 铁律「口令绝不离机」。

### P1 · 稳定性与可运营性

5. **404 兜底页**：当前任意未知路径都返回首页 200，对 SEO 不利，需真实 404。
6. **SEO 结构化数据**：Organization JSON-LD + Twitter Card + 扩展 sitemap（覆盖已上线子站）。
7. **文档纠偏**：README / DEPLOYMENT 与实现保持一致，避免照抄部署失败。

### P2 · 后续迭代（下一阶段）

8. 诗藏 / 文脉正式部署到 `words.loongclan.xyz`（需先绑定 DNS 与 Pages 项目）。
9. 官网增加「更新日志 / Changelog」区块，形成发布节奏感。
10. 增加 Privacy / Terms 页面，补齐国际化产品的合规闭环。
11. 引入 `_headers` / `_redirects` 强化安全响应头与旧路径迁移。

---

## 2. 运营计划（Operations）

### 2.1 内容运营

- **双语气泡**：英文站为主入口（英语优先铁律），中文站承载文化深度内容。
- **产品状态透明**：已上线产品给可点击入口；未上线产品明确标注「In Development · 研发中」，禁止制造虚假期待。
- **LoongPass 工具即内容**：官网首页内嵌三输入框口令派生工具，是最大的自然流量抓手（"passphrase generator"类长尾搜索）。

### 2.2 数据运营（隐私优先）

- 不引入任何第三方统计脚本（符合数据主权铁律）。
- 运营指标仅依赖两类自有信号：
  - Cloudflare 面板的请求量 / 独立访客（边缘侧聚合，无 cookie）；
  - `/api/admin/stats` 的快照数、排行数、封禁数。
- 复盘节奏：每周一次，关注「官网 → 产品」的点击转化（通过页面锚点与外部链接可达性间接衡量）。

### 2.3 成本运营

| 项目 | 免费额度 | 当前用量估算 | 风险 |
| :--- | :--- | :--- | :--- |
| Workers 请求 | 100,000 / 天 | 极低 | 无 |
| D1 行读 | 500 万 / 天 | 极低 | 无 |
| D1 行写 | 100,000 / 天 | 极低 | 无 |
| Pages 带宽 | 无限 | — | 无 |

> 结论：在万级 DAU 以内，月度成本保持 **$0**。

### 2.4 安全运营

- 口令零明文：服务端默认拒绝 `kouling` 字段（`ALLOW_PLAINTEXT_KOULING=false`）。
- 限流：同步接口 60 次/分钟/IP；成绩提交 20 次/分钟/IP + 同账号 5 秒间隔。
- 极值阈值：单条成绩绝对值上限 10 亿，超出直接拒绝。
- 管理端：`/admin/` 提供封禁、下榜、快照清理能力。

---

## 3. 发布计划（Release）

### 3.1 发布通道

```
本地修改 → push GitHub(allen2life/loongclan) → GitHub Actions → Cloudflare
                                              ├─ deploy-web.yml → Pages 项目 loongclan
                                              └─ deploy-api.yml → Worker loongclan-server
```

- **官网**：`deploy-web.yml`，监听 `website/**` 变更，`wrangler pages deploy website`。
- **后端**：`deploy-api.yml`，监听 `server/**` 变更，先跑 68 项测试，再 `wrangler deploy` 并幂等执行建表 SQL。
- **凭据**：仓库 Secrets `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`（已存在）。

### 3.2 发布检查清单（每次上线前）

- [ ] `cd server && npm test` 全绿
- [ ] 官网英文/中文站链接无死链
- [ ] sitemap.xml 与真实在线子域一致
- [ ] 404 页面生效（未知路径返回 404）
- [ ] `api.loongclan.xyz/health` 返回 200
- [ ] **线上 API 拒绝明文口令**（`kouling` 字段 → 400 `plaintext_kouling_rejected`）
- [ ] 线上 API 端到端：上传 → 下载 → 排行 → 注销

### 3.3 回滚策略

- Pages：Cloudflare 控制台可一键回滚到上一部署。
- Workers：`wrangler rollback` 或重新部署上一 commit。
- D1：`rate_limits` 为可再建表，`sync_snapshots` / `rank_scores` 变更前必须备份（`wrangler d1 export`）。

---

## 4. 里程碑

| 里程碑 | 内容 | 状态 |
| :--- | :--- | :--- |
| M1 | 官网死链清零 + 404 + SEO | ✅ 已完成 |
| M2 | 后端 CI/CD 打通，SHA-256 版 API 上线 | ✅ 已完成 |
| M3 | 风控三件套（限流/阈值/零明文）上线并可验证 | ✅ 已完成 |
| M4 | 诗藏/文脉部署到 `words.loongclan.xyz` | 下一阶段 |
| M5 | Privacy / Terms / Changelog 三页补齐 | 下一阶段 |


---

## 5. 本轮交付记录（2026-10-27）

### 5.1 完成的改动

| 类别 | 内容 |
| :--- | :--- |
| 后端安全 | 默认拒绝明文口令（`plaintext_kouling_rejected`）；`/rank/submit` 强制 `syncToken`；`/sync/meta` 加鉴权；`appId`/`boardId` 白名单校验；快照 1 MiB 上限 |
| 后端风控 | `security/limits.ts`：固定窗口限流（IP + userHash 双维度）、成绩极值阈值、`rate_limits` 表、fail-open 容错 |
| 缺陷修复 | `rank_scores.updated_at` 缺失导致刷新成绩 500；`sync_snapshots` 缺 9 列导致上传 500 |
| 数据迁移 | `D1Store.ensureColumns()` 声明式列迁移 + Promise 缓存，兼容历史库 |
| 网站 | 清除 `words.loongclan.xyz` 死链；新增真实 404；en/zh 双语 Organization JSON-LD + Twitter Card；sitemap 覆盖已上线子站；新增「半纸诗声」产品卡 |
| CI/CD | `deploy-web.yml` + `deploy-api.yml`，push 即发布；后端先跑 89 项测试再部署并幂等建表 |
| 工具 | `scripts/smoke.mjs`（25 项线上巡检）、`scripts/publish.mjs`（GitHub API 发布，含最终一致性重试） |
| 文档 | README / DEPLOYMENT / SPEC_SYNC / SPEC_RANK 与实现对齐 |

### 5.2 验证证据

- 本地测试：`api.test.ts` 72 项 + `migration.test.ts` 17 项 = **89 项全通过**
- SDK 测试：SHA-256 派生与 `node:crypto` 逐字节一致
- 线上巡检：**37 项全通过**（官网/404/静态资源/源码防护/子域/健康/零明文/上传/下载/鉴权/排行/注销）
- GitHub Actions：`Deploy Workers API`、`Deploy Website to Cloudflare Pages` 均 success

### 5.3 安全事件记录（本轮已修复）

**事件：全仓源码经官网公网可下载（P0）**

- **现象**：`https://loongclan.xyz/server/src/auth/kouling.ts`、`/README.md`、`/docs/*.md`、
  `/scripts/publish.mjs`、`/sdk/**` 等均可直接 HTTP 200 下载。
- **根因**：远端仓库历史遗留 `.github/workflows/deploy.yml` 执行 `pages deploy .`，
  以**仓库根目录**为站点源，导致整个代码库被当作静态资源发布。
  叠加我早期为兼容旧布局而做的「website/ → 根目录」路径映射，进一步扩大了暴露面。
- **修复**：
  1. 删除遗留 `deploy.yml`；
  2. `deploy-web.yml` 仅发布 `website/`，缺失时**硬失败**而非回退到 `.`；
  3. `publish.mjs` 取消路径映射，远端保留真实 `website/` 目录；
  4. 通过 `sha:null` 清理根目录所有历史静态残留。
- **验证**：带缓存穿透参数访问上述路径均返回 **404**；`smoke.mjs` 新增 `[3b] 源码泄漏防护`
  8 项断言，纳入每次巡检。
- **经验**：`pages deploy .` 是危险的默认写法；任何静态托管都必须显式限定发布子目录，
  并在 CI 中断言该目录存在。

### 5.4 遗留与下一步

1. `words.loongclan.xyz` 仍未部署 —— 需为其创建 Pages 项目并绑定自定义域名
   （代码侧已就绪，但沙箱只允许写 `loongclan` 工作区，无权写 `/data/sites/words`）。
2. ~~遗留 `deploy.yml`~~ —— 已删除。
3. ~~Privacy / Terms~~ —— 已补齐中英双语版本。
4. Changelog 页面待补。
5. 建议后续为官网增加 `_headers`（CSP、X-Frame-Options）强化纵深防御。
