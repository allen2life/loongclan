/**
 * 龙族三维口令身份识别模块 (LoongIdentity)
 * 提供三维口令的格式校验、随机生成与确定性 64 位十六进制双重哈希派生 (UserHash + SyncToken)。
 *
 * 铁律规范 (SPEC_IDENTITY v1.1.0):
 * 1. 统一标准 UTF-8 字节流编码 (new TextEncoder().encode(input))；
 * 2. SHA-256 (NIST FIPS 180-4) 单向散列，零外部依赖，跨平台 100% 绝对一致；
 * 3. 口令每段支持 1~8 字符任意符号（汉字、字母、数字、特殊符号、Emoji 等）；
 * 4. UserHash = hex(SHA-256(UTF-8(kouling + ":id")))；
 * 5. SyncToken = hex(SHA-256(UTF-8(kouling + ":auth")))。
 */

// SHA-256 常量表 (前 64 个质数的立方根小数部分前 32 位)
const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/**
 * 纯 TypeScript 实现的同步标准 SHA-256 算法 (NIST FIPS 180-4)
 * 输入经标准 TextEncoder 转换为 UTF-8 字节流，输出 64 位小写十六进制字符串。
 */
function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let h0 = 0x6a09e667, h1 = 0xbb67ae85, h2 = 0x3c6ef372, h3 = 0xa54ff53a;
  let h4 = 0x510e527f, h5 = 0x9b05688c, h6 = 0x1f83d9ab, h7 = 0x5be0cd19;

  const len = bytes.length;
  const bitLen = len * 8;
  const padLen = ((len + 8) >> 6) + 1;
  const words = new Uint32Array(padLen * 16);

  for (let i = 0; i < len; i++) {
    words[i >> 2] |= bytes[i] << (24 - (i & 3) * 8);
  }
  words[len >> 2] |= 0x80 << (24 - (len & 3) * 8);
  words[words.length - 2] = Math.floor(bitLen / 0x100000000);
  words[words.length - 1] = bitLen >>> 0;

  const w = new Uint32Array(64);

  for (let chunk = 0; chunk < words.length; chunk += 16) {
    for (let i = 0; i < 16; i++) {
      w[i] = words[chunk + i];
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const toHex = (n: number) => (n >>> 0).toString(16).padStart(8, '0');
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

export class LoongIdentity {
  /**
   * 校验单个分段是否合法
   * 规则：修剪首尾不可见空格后，长度必须为 1~8 个字符，且段内不得包含半角点号 '.'。
   * 支持汉字、英文字母、数字、各类标点符号及表情符号（Emoji）。
   */
  static isValidPart(part: string): boolean {
    if (!part || typeof part !== 'string') return false;
    const trimmed = part.trim();
    return trimmed.length >= 1 && trimmed.length <= 8 && !trimmed.includes('.');
  }

  /**
   * 校验三段输入是否均合法
   */
  static isValidParts(p1: string, p2: string, p3: string): boolean {
    return this.isValidPart(p1) && this.isValidPart(p2) && this.isValidPart(p3);
  }

  /**
   * 校验完整三维口令格式是否合法
   * 规则：必须为 3 段，以半角点号 '.' 分隔，每段 1~8 字符任意符号（除半角点号外）
   */
  static isValid(kouling: string): boolean {
    if (!kouling || typeof kouling !== 'string') return false;
    const parts = kouling.split('.');
    if (parts.length !== 3) return false;
    return parts.every(part => this.isValidPart(part));
  }

  /**
   * 核心单向散列：SHA-256(UTF-8(input)) -> 64 位小写十六进制
   * 统一使用标准 UTF-8 字节流编码，保证跨设备、跨语言计算结果严格绝对一致。
   */
  static hashBytes(input: string): string {
    return sha256Hex(input);
  }

  /**
   * 派生公开身份标识 (UserHash)
   * 计算公式：hex(SHA-256(UTF-8(kouling + ":id")))
   * 作用：64 位十六进制字符串。公开主键，用于排行榜、公开数据对账与数据库索引。
   */
  static deriveUserHash(kouling: string): string {
    if (!this.isValid(kouling)) {
      throw new Error('err.kouling_format: Invalid passphrase format (must be 3 parts, 1-8 chars each)');
    }
    return this.hashBytes(kouling + ':id');
  }

  /**
   * 派生私密同步鉴权密文 (SyncToken)
   * 计算公式：hex(SHA-256(UTF-8(kouling + ":auth")))
   * 作用：64 位十六进制字符串。私密鉴权凭据，用于与服务端同步 API 交互，公开接口绝不暴露。
   */
  static deriveSyncToken(kouling: string): string {
    if (!this.isValid(kouling)) {
      throw new Error('err.kouling_format: Invalid passphrase format (must be 3 parts, 1-8 chars each)');
    }
    return this.hashBytes(kouling + ':auth');
  }

  /**
   * 兼容旧版方法：koulingToHash 等价于 deriveUserHash
   */
  static koulingToHash(kouling: string): string {
    return this.deriveUserHash(kouling);
  }

  /**
   * 异步单向散列（可选用 Web Crypto API 进行校验）
   */
  static async hashBytesAsync(input: string): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const bytes = new TextEncoder().encode(input);
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return [...new Uint8Array(digest)]
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
    }
    return this.hashBytes(input);
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

  /**
   * 口令脱敏遮罩显示（类似手机号码脱敏规则，默认不展示完整保密凭据）
   * 平台铁律：所有 loongclan 应用在回显口令时，默认仅显示部分（如 loong.***.*** 或 loong.***.abc）
   *
   * @param kouling 原始三维口令
   * @param mode 遮罩模式：'center' (默认，类似手机号保留首尾段，掩码中间段) | 'tail-mask' (仅保留首段，后两段全掩码)
   */
  static mask(kouling: string, mode: 'center' | 'tail-mask' = 'center'): string {
    if (!this.isValid(kouling)) return '***.***.***';
    const parts = kouling.split('.');
    if (mode === 'tail-mask') {
      return `${parts[0]}.***.***`;
    }
    return `${parts[0]}.***.${parts[2]}`;
  }

  /**
   * 智能输入处理：修剪前后空白，将全角句号（。）或中文间隔号（·）智能转换为半角点号（.）
   */
  static cleanInput(input: string): string {
    if (!input || typeof input !== 'string') return '';
    return input.trim().replace(/[。·]/g, '.');
  }

  /**
   * 将口令或粘贴文本拆分为三段（自动转换中文句号/间隔号）
   * 若无法拆分为合法 3 段则返回 null
   */
  static splitParts(input: string): [string, string, string] | null {
    const cleaned = this.cleanInput(input);
    const parts = cleaned.split('.');
    if (parts.length !== 3) return null;
    return [parts[0].trim(), parts[1].trim(), parts[2].trim()];
  }
}

