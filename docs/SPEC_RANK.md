# 龙族通用技术规范：通用排行榜协议 (SPEC_RANK)

**版本**：v1.0.0  
**定位**：适用于文化小游戏与单机应用的全服/好友/关卡排行榜服务

---

## 1. 概念与数据模型

排行榜系统支持三维分片维度：
1. **应用维度 (`appId`)**：例如 `xiangqi`、`words`、`shizang` 等。
2. **榜单维度 (`boardId`)**：
   - 关卡榜：如 `level_1`、`level_252` 等；
   - 综合榜：如 `total_score`、`total_stars`、`streak` 等。
3. **周期维度 (`period`)**：
   - `all`：历史总榜（永不清空）；
   - `daily`：每日榜单（以北京时间 00:00 自动切换时间槽）；
   - `weekly`：每周榜单（每周一 00:00 切换）。

---

## 2. API 接口定义

### 2.1 提交榜单成绩 (Submit Score)

- **路径**：`POST /api/v1/rank/submit`
- **说明**：玩家完成游戏/关卡后，主动向服务器提交本轮成绩以参与排行榜。

#### 请求体 (Request Body)
```json
{
  "appId": "words",
  "boardId": "daily_20260909",
  "period": "daily",
  "userHash": "8a3f...64位公开身份标识...",
  "syncToken": "c72b...64位私密鉴权密文(口令派生)...",
  "nickname": "诗眼破壁人",
  "score": 980,
  "stars": 3,
  "sortOrder": "desc",
  "extraData": "{\"guessCount\": 3, \"timeUsedMs\": 45000}"
}
```

#### 字段说明
| 字段 | 类型 | 必选 | 说明 |
| :--- | :--- | :--- | :--- |
| `appId` | string | 是 | 应用标识符 |
| `boardId` | string | 是 | 榜单标识符（如 `total` 或具体关卡代号） |
| `period` | string | 否 | 周期类型：`all` (默认), `daily`, `weekly` |
| `userHash` | string | 是 | 64位十六进制公开用户标识 |
| `syncToken` | string | 是 | 64位十六进制私密鉴权密文（由前端本地派生，绝不传输口令原文） |
| `nickname` | string | 是 | 玩家昵称（1-30字符） |
| `score` | number | 是 | 成绩得分（整数） |
| `stars` | number | 否 | 星级或评价（0-5） |
| `sortOrder` | string | 否 | 排序逻辑：`desc`（高分优先，默认）或 `asc`（低值/快者优先） |
| `extraData` | string | 否 | 附加数据（战报概要、通关用时等 JSON 字符串） |

> **防冒充与安全防线**：全服排行榜查询仅公开 `userHash` 与 `nickname`，绝不暴露 `syncToken`。任何人即使在榜单中查到高手的 `userHash`，也因无法获知其 `syncToken`，彻底无法伪造该身份覆盖云端存档或恶意刷分。

#### 响应 (Response 200)
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "rank": 3,
    "score": 980,
    "improved": true
  }
}
```

---

### 2.2 查询排行榜 (Query Leaderboard)

- **路径**：`GET /api/v1/rank/query`
- **说明**：获取指定应用与榜单的 Top-N 玩家列表，若传递当前用户的 `userHash`，一并返回该用户当前的实时位次。

#### 查询参数 (Query Parameters)
| 参数 | 类型 | 说明 |
| :--- | :--- | :--- |
| `appId` | string | 应用标识符（如 `words`） |
| `boardId` | string | 榜单标识（默认 `total`） |
| `period` | string | 周期：`all` / `daily` / `weekly`（默认 `all`） |
| `limit` | number | 返回名额数量（默认 50，上限 100） |
| `userHash` | string | （可选）查询者的 UserHash，用于返回自身排名 |

#### 响应示例 (Response 200)
```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "list": [
      {
        "rank": 1,
        "userHash": "1a2b3c...",
        "nickname": "青莲居士",
        "score": 1200,
        "stars": 5,
        "publishTime": 1757380000000,
        "extraData": ""
      },
      {
        "rank": 2,
        "userHash": "4d5e6f...",
        "nickname": "东坡居士",
        "score": 1150,
        "stars": 4,
        "publishTime": 1757381000000,
        "extraData": ""
      }
    ],
    "userRank": {
      "rank": 15,
      "score": 980,
      "stars": 3
    },
    "totalCount": 182
  }
}
```

---

## 3. 防刷与轻量风控机制

由于龙族各小游戏坚持单机离线运行，服务器不强制校验全量步数回放以保持极简与免维护，但通过以下多重轻量机制防范异常刷分：
1. **口令哈希强制验证**：提交成绩必须持有能够哈希到 `userHash` 的真实三维口令，拒绝凭空冒用他人 Hash 发送请求。
2. **频率限制（Rate Limiting）**：同一 `userHash` 成绩提交至少间隔 5 秒，单 IP 每分钟最多提交 20 次。
3. **极值上限阈值配置（Sanity Bounds）**：单局关卡理论最高分由前端游戏逻辑设定上限，超过合理阈值的成绩直接拒绝入库。
4. **管理端一键净化**：管理员可在管理控制台中针对异常作弊记录一键下榜或将作弊 `userHash` 列入黑名单。

---

## 4. UI 展示与隐私规范（所有应用强制遵循）

1. **榜单公共区域只展示昵称**：排行榜查询返回及 UI 渲染中，展示给其他玩家和用户自身的均仅为“用户昵称（`nickname`）”，**绝对严禁将三维口令作为展示标识或在排行榜上公开**。
2. **防关联与隐私防护**：服务端排行榜返回的数据结构中绝不包含 `kouling` 字段，客户端在呈现排行榜列表和自身名片时统一显示“昵称”。
