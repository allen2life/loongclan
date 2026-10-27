/**
 * 服务端口令校验、身份识别与确定性哈希派生 (SPEC_IDENTITY v1.1.0)
 *
 * 铁律规范：
 * 1. 统一标准 UTF-8 字节流编码 (new TextEncoder().encode(input))
 * 2. 标准 SHA-256 (NIST FIPS 180-4) 单向散列，零外部依赖，跨平台 100% 绝对一致
 * 3. 口令每段 1~8 字符任意符号（汉字、英文字母、数字、特殊符号、Emoji 等），除半角点号 '.' 外
 * 4. UserHash = hex(SHA-256(UTF-8(kouling + ":id")))
 * 5. SyncToken = hex(SHA-256(UTF-8(kouling + ":auth")))
 * 6. 零明文口令交互铁律：口令绝不离机，服务端只接收与校验 userHash 与 syncToken
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
 * 同步标准 SHA-256 (NIST FIPS 180-4) 纯实现
 * 输入经标准 TextEncoder 转换为 UTF-8 字节流，输出 64 位小写十六进制字符串。
 */
export function sha256Hex(input: string): string {
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

/**
 * 校验口令分段是否合法
 * 规则：修剪首尾不可见空格后，字符数在 1~8 之间，且不得包含半角点号 '.'。
 * 允许包含中文汉字、英文字母、数字、任意标点符号及表情符号 (Emoji)。
 */
export function isValidPart(part: string): boolean {
  if (typeof part !== 'string') return false;
  const trimmed = part.trim();
  const chars = [...trimmed];
  return chars.length >= 1 && chars.length <= 8 && !trimmed.includes('.');
}

/**
 * 校验三维口令是否合法 (三段由半角点号 '.' 分隔)
 */
export function isValidKouling(kouling: string): boolean {
  if (!kouling || typeof kouling !== 'string') return false;
  const parts = kouling.split('.');
  if (parts.length !== 3) return false;
  return parts.every(p => isValidPart(p));
}

/**
 * 校验 64 位十六进制哈希字符串
 */
export function isValidHash(hash: string): boolean {
  return typeof hash === 'string' && /^[0-9a-fA-F]{64}$/.test(hash);
}

/**
 * 派生公开身份标识 (UserHash = SHA-256(UTF-8(kouling + ":id")))
 */
export function deriveUserHash(kouling: string): string {
  if (!isValidKouling(kouling)) throw new Error('err.kouling_format');
  return sha256Hex(kouling + ':id');
}

/**
 * 派生私密同步鉴权密文 (SyncToken = SHA-256(UTF-8(kouling + ":auth")))
 */
export function deriveSyncToken(kouling: string): string {
  if (!isValidKouling(kouling)) throw new Error('err.kouling_format');
  return sha256Hex(kouling + ':auth');
}

/**
 * 兼容旧命名方法：koulingToHash 等价于 deriveUserHash
 */
export function koulingToHash(kouling: string): string {
  return deriveUserHash(kouling);
}

/**
 * 验证口令与 userHash 是否匹配
 */
export function verifyKoulingMatch(kouling: string, userHash: string): boolean {
  try {
    return deriveUserHash(kouling) === userHash.toLowerCase();
  } catch {
    return false;
  }
}

/**
 * 安全比较两个 64 位十六进制密文/Token 是否一致 (恒定耗时比对)
 */
export function verifyTokenMatch(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  const al = a.toLowerCase();
  const bl = b.toLowerCase();
  for (let i = 0; i < al.length; i++) {
    diff |= al.charCodeAt(i) ^ bl.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * 口令脱敏遮罩回显 (类似手机号脱敏规则，默认绝不显示完整明文口令)
 */
export function mask(kouling: string, mode: 'center' | 'tail-mask' = 'center'): string {
  if (!isValidKouling(kouling)) return '***.***.***';
  const parts = kouling.split('.');
  if (mode === 'tail-mask') {
    return `${parts[0]}.***.***`;
  }
  return `${parts[0]}.***.${parts[2]}`;
}

/**
 * 智能输入清洗 (去除首尾空白，全角句号与间隔号转半角点号)
 */
export function cleanInput(input: string): string {
  if (!input || typeof input !== 'string') return '';
  return input.trim().replace(/[。·]/g, '.');
}
