# 龙族通用技术规范：三维口令轻量身份体系 (SPEC_IDENTITY)

**版本**：v1.1.0  
**适用范围**：龙族（loongclan.xyz）生态所有单机游戏、离线优先应用与云端中继同步服务

---

## 1. 设计哲学与愿景

传统的互联网账号体系（邮箱、手机号+短信、密码、第三方 OAuth 等）存在以下对于小型独立/文化类单机应用的致命痛点：
1. **运维成本高昂**：短信验证码、邮件服务器、OAuth 回调服务需要持续付费并维护后端；
2. **隐私合规负担重**：收集手机号与个人信息面临复杂的个人信息保护与隐私合规要求；
3. **打破单机体验**：强制弹出“请登录/注册”弹窗严重破坏沉浸式体验。

**龙族三维口令体系**遵循如下最高铁律：
- **零注册，免登录**：用户无需输入手机号、邮箱或设置传统密码。
- **三段结构，独立三框**：口令采用三段式记忆短语（例如 `loong.888.abc`、`诗藏.唐.001`）。**前端输入框必须为三个独立输入框**，禁止单框手动打点。
- **每段 1~8 字符任意符号**：每段允许输入 1~8 个**任意字符**（包括汉字、英文字母、数字、各类标点符号及表情符号），前端自动做首尾空白 Trim 防呆。
- **双重确定性哈希派生（Dual-Hash）**：口令由客户端通过单向抗碰撞算法确定性派生出两个哈希：
  - `UserHash`（64位十六进制公开标识）：作为公开索引主键，用于全服排行榜、公开数据对账与数据库主键；
  - `SyncToken`（64位十六进制私密鉴权密文）：作为与服务端 API 交互的私密身份验证密文，替代明文口令的传输。
- **零明文传输铁律（口令绝对不离机）**：
  - **口令明文绝对 100% 留在前端客户端，严禁向服务端 API 发送口令原文，服务端绝不接收、绝不存储明文口令**！
  - 前后端 API 交互**只传散列后的密文**（`userHash` 与 `syncToken`）；
  - 即使排行榜公开展示了玩家的 `UserHash`，任何外部人员也无法反推其口令，更无法凭 `UserHash` 下载或篡改该玩家的私有存档（因其不具备 `SyncToken`）。

---

## 2. 格式规范与输入框交互铁律

### 2.1 三输入框结构铁律
所有 `loongclan` 生态应用在涉及输入三维口令时，**界面输入框必须为三个独立的输入框**：

$$\left[\ \text{输入框}_1\ \right]\ \ .\ \ \left[\ \text{输入框}_2\ \right]\ \ .\ \ \left[\ \text{输入框}_3\ \right]$$

- **严禁采用单一长输入框**让用户手动输入英文句点 `.`，彻底杜绝输入法中英文句号（`。` vs `.`）切换失误导致的混淆；
- 界面在三个输入框之间以视觉点号（`.`）自然分隔。

### 2.2 每段 1~8 个字符任意符号
- **分段长度**：每一段输入修剪后长度严格限制在 **1 到 8 个字符**（`maxLength={8}`）。
- **允许字符集**：**允许任意符号与字符**！
  - 中文汉字（如 `龙族`、`诗藏`、`文脉`）
  - 英文字母（大小写 `A-Z`, `a-z`）
  - 阿拉伯数字（`0-9`）
  - 任意特殊标点符号（如 `_`, `-`, `!`, `@`, `#`, `$`, `%`, `^`, `&`, `*`, `~`, `+`, `=`, `/`, `?` 等，除段内半角点号 `.` 外）
  - Emoji 与特殊符号（如 🐉, ⚔️, 📜 等）
- **防呆修剪（Trim）**：前端在读取每个输入框内容时，必须自动去除首尾不可见空白字符（空格、换行、制表符），防止软键盘误触多余空格导致跨设备哈希不一致。

### 2.3 校验函数规范 (TypeScript 参考)
```ts
export function isValidPart(part: string): boolean {
  if (typeof part !== 'string') return false;
  const trimmed = part.trim();
  // 必须为 1~8 个字符，且段内不得包含半角点号 '.'
  return trimmed.length >= 1 && trimmed.length <= 8 && !trimmed.includes('.');
}

export function isValidKoulingParts(p1: string, p2: string, p3: string): boolean {
  return isValidPart(p1) && isValidPart(p2) && isValidPart(p3);
}

export function isValidKouling(kouling: string): boolean {
  if (!kouling || typeof kouling !== 'string') return false;
  const parts = kouling.split('.');
  if (parts.length !== 3) return false;
  return parts.every(p => isValidPart(p));
}
```

---

## 3. 确定性双重哈希派生算法 (Dual-Hash)

为彻底达成“口令原文 100% 留在前端客户端，前后端通信只传散列密文”的铁律，客户端采用 **UTF-8 字节流编码 + SHA-256 单向散列 + 命名空间域分隔（Domain Separation）**，分别派生出两个独立哈希：

> **【v1.1.0 修订说明】**：本版将散列基元从 **FNV-1a（32-bit 非密码学哈希）升级为 SHA-256**（NIST FIPS 180-4，128-bit 安全强度，全平台标准库/系统库原生支持）。v1.0.0 的“64 位十六进制输出”是对同一 32 位内部状态做 64 次非线性展开的装饰结果，有效强度只有 2³²，抗碰撞（约 2¹⁶ 生日界）与抗预映像（约 2³¹）均不足，且 `userHash`/`syncToken` 共享同一状态根基；SHA-256 输出为原生 256 位摘要，无需任何二次置乱。**注意：v1.1.0 派生值与 v1.0.0 派生值同为 64 位十六进制，格式无法互相区分**——服务端必须按端点/租户隔离新旧体系（既有 FNV 旧线一律走 legacy 兼容端点），严禁同一存储表混用两种派生。

### 3.1 编码与派生规则

> **【UTF-8 跨平台一致性铁律（P0 级标准）】**：  
> 计算 `UserHash` 和 `SyncToken` 时，**必须统一使用标准 UTF-8 字节流（即 Web / JS / TS 端统一使用 `new TextEncoder().encode(input)`，Go 端使用 `[]byte(input)`，C++ 端使用标准 UTF-8 字节序列）**。  
> **严禁**使用 JavaScript 传统的 `charCodeAt()` 逐字符遍历，因为 `charCodeAt()` 仅按 UTF-16 代码单元取值，在处理中文汉字（多字节）以及 Emoji 表情符（高低代理对）时会产生截断与跨平台不一致。**必须严格先转为标准 UTF-8 字节序列再执行散列，以保证同一口令在任何设备、任何操作系统与任何编程语言上算出的 Hash 严格绝对一致！**

1. **公开身份标识 (`UserHash`)**：
   - 输入向量：`kouling + ":id"`（三段组合加 `:id` 域分隔后缀）
   - 字节转换：`new TextEncoder().encode(kouling + ":id")`
   - 作用：64 位十六进制字符串。公开主键，用于全服排行榜、数据库存储与对外对账。
2. **私密同步鉴权密文 (`SyncToken`)**：
   - 输入向量：`kouling + ":auth"`（三段组合加 `:auth` 域分隔后缀）
   - 字节转换：`new TextEncoder().encode(kouling + ":auth")`
   - 作用：64 位十六进制字符串。私密凭证，用于客户端向服务端调用同步接口鉴权，**公开接口（如排行榜）绝对不暴露它**。

### 3.2 单向散列核心算法（SHA-256）
统一调用标准 **SHA-256**（FIPS 180-4）：输入为 UTF-8 字节序列，输出取其 256 位摘要的标准 **64 位小写十六进制**编码，**不做任何二次置乱、截断或扩展**：

$$\text{UserHash} = \text{hex}\big(\ \text{SHA-256}\left(\ \text{UTF-8}(kouling + ":id")\ \right)\ \big)$$

$$\text{SyncToken} = \text{hex}\big(\ \text{SHA-256}\left(\ \text{UTF-8}(kouling + ":auth")\ \right)\ \big)$$

> 域分隔后缀（`:id` / `:auth`）是派生协议不可分割的一部分，作用是把公开标识与私密凭据分离为同一口令下的两个独立输出——**仅凭 `UserHash` 无法推导 `SyncToken`**。实现上必须调用平台原生/审计过的 SHA-256（Web `crypto.subtle`、Go `crypto/sha256`、C++ 自包含实现），**严禁以任何自定义“伪随机置乱扩展”替代标准散列**。

---

## 4. 多语言标准参考实现

### 4.1 TypeScript / JavaScript (Web / Node / Workers)
```typescript
export class LoongIdentity {
  /**
   * 校验分段是否合法（1~8字符任意符号，除半角点号外）
   */
  static isValidPart(part: string): boolean {
    if (typeof part !== 'string') return false;
    const trimmed = part.trim();
    return trimmed.length >= 1 && trimmed.length <= 8 && !trimmed.includes('.');
  }

  /**
   * 校验三维口令
   */
  static isValid(kouling: string): boolean {
    if (!kouling || typeof kouling !== 'string') return false;
    const parts = kouling.split('.');
    if (parts.length !== 3) return false;
    return parts.every(p => this.isValidPart(p));
  }

  /**
   * 核心单向散列：SHA-256(UTF-8 字节流) -> 64位小写十六进制
   * 依赖 Web Crypto API（crypto.subtle，需 HTTPS 安全上下文；本生态全站强制 HTTPS，天然满足）
   */
  static async hashBytes(input: string): Promise<string> {
    const bytes = new TextEncoder().encode(input);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * 派生公开身份标识 (UserHash)
   */
  static async deriveUserHash(kouling: string): Promise<string> {
    if (!this.isValid(kouling)) throw new Error('err.kouling_format');
    return this.hashBytes(kouling + ':id');
  }

  /**
   * 派生私密同步鉴权密文 (SyncToken) - 用于替代口令原文向 API 发送
   */
  static async deriveSyncToken(kouling: string): Promise<string> {
    if (!this.isValid(kouling)) throw new Error('err.kouling_format');
    return this.hashBytes(kouling + ':auth');
  }

  /**
   * 兼容方法：koulingToHash 等价于 deriveUserHash
   */
  static koulingToHash(kouling: string): Promise<string> {
    return this.deriveUserHash(kouling);
  }

  /**
   * 快速生成随机安全的三维口令（默认前缀 lg，方便记忆）
   */
  static generateRandom(prefix = 'lg'): string {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    const randChunk = (len: number) => {
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };
    return `${prefix}.${randChunk(4)}.${randChunk(4)}`;
  }
}
```

### 4.2 Go
```go
package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strings"
)

func IsValidPart(part string) bool {
	trimmed := strings.TrimSpace(part)
	r := []rune(trimmed)
	return len(r) >= 1 && len(r) <= 8 && !strings.Contains(trimmed, ".")
}

func IsValidKouling(kouling string) bool {
	parts := strings.Split(kouling, ".")
	if len(parts) != 3 {
		return false
	}
	for _, p := range parts {
		if !IsValidPart(p) {
			return false
		}
	}
	return true
}

// SHA-256(UTF-8(input)) -> 64位小写十六进制
func HashBytes(input string) string {
	sum := sha256.Sum256([]byte(input)) // []byte(string) 即标准 UTF-8 字节流
	return hex.EncodeToString(sum[:])
}

func DeriveUserHash(kouling string) (string, error) {
	if !IsValidKouling(kouling) {
		return "", errors.New("invalid kouling format")
	}
	return HashBytes(kouling + ":id"), nil
}

func DeriveSyncToken(kouling string) (string, error) {
	if !IsValidKouling(kouling) {
		return "", errors.New("invalid kouling format")
	}
	return HashBytes(kouling + ":auth"), nil
}
```

### 4.3 C++ (WASM / 原生客户端)
```cpp
#include <array>
#include <cstdint>
#include <cstring>
#include <string>

// ========== 自包含 SHA-256（FIPS 180-4），零依赖，跨桌面/WASM 一致 ==========
namespace sha256 {

inline uint32_t rotr(uint32_t x, uint32_t n) {
    return (x >> n) | (x << (32 - n));
}

inline std::string hex(const std::array<uint32_t, 8>& h) {
    static const char* digits = "0123456789abcdef";
    std::string out;
    out.reserve(64);
    for (uint32_t w : h)
        for (int i = 7; i >= 0; i--) out.push_back(digits[(w >> (i * 4)) & 0xf]);
    return out;
}

inline std::string digest(const std::string& msg) {
    static const uint32_t K[64] = {
        0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
        0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
        0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
        0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
        0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
        0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
        0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
        0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2};
    std::array<uint32_t, 8> h = {0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19};

    // 填充：0x80 + 零 + 64 位比特长度（大端），msg 必须已是 UTF-8 字节串
    const uint64_t bit_len = static_cast<uint64_t>(msg.size()) * 8;
    std::string padded = msg;
    padded.push_back(static_cast<char>(0x80));
    while ((padded.size() % 64) != 56) padded.push_back('\0');
    for (int i = 7; i >= 0; i--)
        padded.push_back(static_cast<char>((bit_len >> (i * 8)) & 0xff));

    uint32_t w[64];
    for (size_t off = 0; off < padded.size(); off += 64) {
        for (int i = 0; i < 16; i++)
            w[i] = (static_cast<uint8_t>(padded[off + i * 4]) << 24) |
                   (static_cast<uint8_t>(padded[off + i * 4 + 1]) << 16) |
                   (static_cast<uint8_t>(padded[off + i * 4 + 2]) << 8) |
                   static_cast<uint8_t>(padded[off + i * 4 + 3]);
        for (int i = 16; i < 64; i++) {
            uint32_t s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >> 3);
            uint32_t s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >> 10);
            w[i] = w[i - 16] + s0 + w[i - 7] + s1;
        }
        uint32_t a = h[0], b = h[1], c = h[2], d = h[3];
        uint32_t e = h[4], f = h[5], g = h[6], hh = h[7];
        for (int i = 0; i < 64; i++) {
            uint32_t S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
            uint32_t ch = (e & f) ^ (~e & g);
            uint32_t t1 = hh + S1 + ch + K[i] + w[i];
            uint32_t S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
            uint32_t maj = (a & b) ^ (a & c) ^ (b & c);
            uint32_t t2 = S0 + maj;
            hh = g; g = f; f = e; e = d + t1;
            d = c; c = b; b = a; a = t1 + t2;
        }
        h[0] += a; h[1] += b; h[2] += c; h[3] += d;
        h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
    }
    return hex(h);
}

}  // namespace sha256

// ========== 派生层 ==========
inline bool is_valid_part(const std::string& part) {
    if (part.empty() || part.size() > 32) return false; // 字节上限 32 = 8 个 UTF-8 字符的最大字节数（每字符 ≤4 字节）
    if (part.find('.') != std::string::npos) return false;
    return true;
}

inline bool is_valid_kouling(const std::string& kouling) {
    size_t first = kouling.find('.');
    size_t last = kouling.rfind('.');
    if (first == std::string::npos || first == last) return false;
    return is_valid_part(kouling.substr(0, first)) &&
           is_valid_part(kouling.substr(first + 1, last - first - 1)) &&
           is_valid_part(kouling.substr(last + 1));
}

inline std::string hash_bytes(const std::string& input) {
    return sha256::digest(input); // input 必须是标准 UTF-8 字节序列
}

inline std::string derive_user_hash(const std::string& kouling) {
    return hash_bytes(kouling + ":id");
}

inline std::string derive_sync_token(const std::string& kouling) {
    return hash_bytes(kouling + ":auth");
}
```

---

## 5. 常见业务场景与流程

### 5.1 首次游玩（创建口令）
1. 玩家首次进入小游戏时，若本地无记录，小游戏本地自动生成默认标识（纯离线直接玩）。
2. 当玩家希望“换设备玩 / 云备份”时，点击界面【设置同步口令】：
   - 提供【自动生成】推荐（如 `lg.9x7a.m2k4`）或由玩家【自定口令】。
   - 客户端立即计算其 `userHash`，保存至本地 `localStorage`。

### 5.2 换设备迁移（导入已有口令）
1. 玩家在新手机/电脑打开小游戏，进入【同步设置】页面，选择【使用已有口令】。
2. 界面呈现**三个独立输入框**，玩家输入三段口令（支持一键粘贴自动拆分到三个框）。
3. 客户端在本地内存中即时派生出 `userHash` 与 `syncToken`。
4. 客户端发起同步请求 `POST /api/v1/sync/download`，**请求体中仅携带散列密文 `userHash` 与 `syncToken`，绝对不包含口令原文**。
5. 服务端核验 `syncToken` 鉴权合法后，返回云端最新快照，客户端本地合并恢复，实现安全无缝切换。

### 5.3 安全性与防篡改防御
- **公开与私密彻底分离**：
  - `UserHash` 虽在全服排行榜完全公开，但攻击者即使持有他人的 `UserHash`，也因无法获取用户的私密 `SyncToken`，根本无法读取、下载或覆盖该用户的云端存档！
- **抗暴力枚举**：服务端同步接口配有基于 IP 与 Hash 的频次限流。
- **不可伪造性**：对于涉及全服排行榜的成绩与云端存档提交，客户端上传时必须携带 `userHash` + `syncToken`，服务端强制比对鉴权密文是否一致，严禁伪造上榜。
- **关于时间戳与时钟漂移的架构裁量**：
  - **`UserHash` 绝对不含时间戳**：作为数据库与榜单的永久主键索引，必须具备 100% 确定性恒定（Deterministic）。
  - **`SyncToken` 采用确定性派生（不加时间戳）**：单机文化小游戏以离线优先与极致鲁棒为首要考量。若引入毫秒时间戳与服务端过期验证，移动端用户常因手机时区错误、时钟漂移（快/慢数分钟）频繁触发“请求过期、同步失败”的恶劣体验；端到端网络防窃听由全站强制 **HTTPS / TLS 1.3** 传输层加密保障，保持架构极简与 100% 时钟容错。

---

## 6. 三维口令保密与界面呈现铁律（所有 loongclan 应用强制遵循）

> **平台核心铁律（P0 级红线）**：  
> **1. 龙族三维口令同步中，口令属于核心保密信息，一般不显示。口令原文 100% 留在前端客户端，绝对不向服务端传输；**  
> **2. 输入框必须为三个独立输入框，每段为 1~8 字符任意符号，支持自动跳格、退格回退与智能粘贴解析；**  
> **3. 回显时默认仅显示部分（类似手机号码脱敏规则），支持眼睛显隐切换；**  
> **4. 应用常驻界面上统一展示用户“昵称”，严禁展示口令。**  
> **所有 loongclan 旗下的应用与生态产品必须 100% 严格遵循这一条。**

### 6.1 口令核心定位：保密信息，一般不显示
- **私钥属性**：三维口令（`part1.part2.part3`）是用户在去中心化免注册体系下的最高身份私钥与全量数据恢复凭证，服务端绝不存储明文口令；
- **保密原则（一般不显示）**：既然口令是恢复资产的“私钥”，其天然属于高度敏感的保密信息，在常规日常使用中**一般不显示**，严禁在页面无遮掩地长期暴露；
- **防止泄露场景**：杜绝用户在截屏分享战绩、直播游玩、公共场合使用、多屏投影或录屏时被旁人或监控窥探复制口令。

### 6.2 界面常驻区呈现规范：统一显示“用户昵称”，严禁展示口令
- **展示对象**：旗下所有应用（WebApp、H5、小程序、原生客户端）的常驻 UI 区域，包括但不限于：
  - 页面顶栏（Header / TopBar）与导航栏（Navbar）
  - 个人状态栏（User Profile Summary）
  - 排行榜个人条目（Leaderboard Self-Rank Item）
  - 游戏胜利/结算页面的玩家署名
  - 设置与同步面板的入口按钮
- **强制要求**：
  - **必须且只能展示用户的“昵称（Nickname）”**（如“小诗童”、“文脉探求者”、“弈林隐者”）；
  - **绝对禁止在常驻界面上直接展示明文三维口令**；
  - 昵称是开放的展示属性，支持用户在同步设置中自由修改（长度建议 1~30 字符），不具备私密性；
  - 昵称旁可搭配轻量级的“云同步状态图标”（如 `Cloud` / `CloudCheck` / `ShieldCheck`），增强用户对同步状态的感知。

### 6.3 凭据查看与回显规范：类似手机号码部分脱敏展示（Masking）
仅当用户明确主动点击昵称或“账号与同步”设置入口、进入凭据管理弹窗时，方可涉及口令的回显，且必须满足以下规则：
- **默认部分脱敏（类似手机号码脱敏规则）**：
  - 类比规则：手机号码敏感信息保护规范通常隐藏中间 4 位（例如 `138****1234`）；
  - 口令脱敏标准：三维口令默认**必须进行中间遮罩或部分脱敏展示**，严禁进入弹窗直接回显全明文！
    - **标准脱敏形态（推荐）**：显示第一段与第三段，中间段掩码，如 `loong.***.abc` 或 `part1.***.part3`；
    - **深层脱敏形态**：对各段进一步保留首尾字符掩码，如 `l***g.***.a***c`；
    - 统一通过 SDK 提供的 `LoongIdentity.mask(kouling)` 方法处理。
- **显隐切换交互（眼睛图标）**：
  - 脱敏口令右侧必须提供“眼睛”图标切换按钮（👁️ / 🙈）；
  - 只有在用户明确主动点击“眼睛”后，才短暂切换为明文展示；再次点击立即恢复脱敏遮罩；
- **一键安全复制**：
  - 脱敏展示旁必须提供独立的“复制”按钮；
  - 点击后直接将完整的有效口令复制至系统剪贴板，无需用户先切为明文再手动全选，兼顾便捷性与防窥安全性；
  - 复制成功后应弹出微提示（如“口令已复制，请妥善保管”）。

### 6.4 智能输入与防窥探铁律（三输入框设计）
当用户在“使用已有口令”、“更换设备恢复存档”等场景需要手动输入口令时：
- **三个独立输入框结构（强制）**：
  - 界面必须呈现为三个并排的独立输入框（`[ Box 1 ] . [ Box 2 ] . [ Box 3 ]`），严禁让用户在单框中自行打点；
  - 每框支持 1~8 个任意符号（汉字、字母、数字、特殊符号、Emoji）；
- **智能跳格联动（Auto-Advance）**：
  - 第 1 框输入达 8 字符或用户键入半角点号 `.` 时，焦点自动跳转至第 2 框；
  - 第 2 框输入达 8 字符或用户键入半角点号 `.` 时，焦点自动跳转至第 3 框；
- **退格智能回退（Backspace Navigation）**：
  - 当第 2 框内容为空且用户按下退格键（Backspace）时，光标自动回退到第 1 框末尾；第 3 框同理；
- **智能一键粘贴解析（Smart Paste）**：
  - 用户从外部复制了带点号的三段口令（如 `loong.888.abc`），在任何一个框执行粘贴（Ctrl+V），组件自动识别并按点号拆分成三部分，分别填入三个输入框；
- **密码掩码与统一显隐切换**：
  - 三个输入框默认均以密码掩码模式呈现（`type="password"`，圆点 `••••` 遮罩显示），杜绝旁人偷窥与录屏泄露；
  - 旁边配备一个统一的眼睛按钮，一键同步在明文与密文之间切换；
- **自动去除首尾空白（Trim）**：
  - 自动 trim 消除软键盘输入可能带入的首尾不可见空格，防止因看不见的空格产生错误哈希。

### 6.5 数据主权与注销支持
- **生成新口令**：提供【生成新口令】选项，生成后提示用户妥善备份；
- **清除本地凭据（退出）**：提供【注销/清除本地凭据】功能。清除后重置为本地游客状态，同时清空本地存储的 `userHash` 与自定义昵称。

### 6.6 所有 loongclan 下的应用强制遵循清单与验收标准

本规范适用于 `loongclan.xyz` 生态旗下所有已发布与未来研发的小游戏、WebApp 及工具应用：

| 应用名称 | 英文标识 | 默认昵称参考 | 状态 | 规范落实要点 |
| :--- | :--- | :--- | :--- | :--- |
| **《诗藏》** | `words` (Shizang) | 诗眼破壁人 / 小诗童 | 核心产品 | 顶栏显示昵称，SyncModal 密码模式输入+口令类似手机号掩码 |
| **《文脉》** | `words` (Wenmai) | 文脉探求者 | 核心产品 | 与诗藏共用统一账户与同步组件，遵循相同铁律 |
| **《棋阵风暴》** | `xiangqi` / `chessblast` | 弈林隐者 / 龙魂棋手 | 核心产品 | 顶栏与排行榜只显昵称，登录/同步弹窗密码掩码输入 |
| **《小诗童》** | `recite` | 小诗童 | 核心产品 | 个人中心与打卡卡片只展示昵称，口令设置默认脱敏回显 |
| **龙族通行证** | `loongclan-website` | 龙族行者 | 官网门户 | 通行证生成工具提供掩码回显与一键复制，强调私钥保密属性 |

#### 验收 Checklist（上线前必查）
- [x] **检查项 1（常驻界面）**：应用顶栏、导航条、排行榜个人栏位中是否统一显示“昵称”，无任何明文口令暴露？
- [x] **检查项 2（口令脱敏）**：打开口令设置或查看面板时，口令是否默认处于部分脱敏状态（类似手机号脱敏）？
- [x] **检查项 3（显隐交互）**：口令脱敏处是否配备眼睛图标，且仅在主动点击时才切为明文？
- [x] **检查项 4（智能输入）**：导入/切换口令的输入框是否默认为密码掩码（`type="password"`）并带切换明文按钮？
- [x] **检查项 5（智能纠错）**：口令输入是否支持智能去除空格及全角句号 `。` 自动转半角点号 `.`？
- [x] **检查项 6（安全复制）**：是否支持一键复制完整有效口令并弹出防泄露安全提醒？


