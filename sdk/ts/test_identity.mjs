// Test vector validation for LoongIdentity (v1.1.0 SPEC_IDENTITY)
import crypto from 'crypto';

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

function rotr(x, n) {
  return (x >>> n) | (x << (32 - n));
}

function sha256Hex(input) {
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

  const toHex = (n) => (n >>> 0).toString(16).padStart(8, '0');
  return toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) + toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7);
}

function isValidPart(part) {
  if (!part || typeof part !== 'string') return false;
  const trimmed = part.trim();
  return trimmed.length >= 1 && trimmed.length <= 8 && !trimmed.includes('.');
}

function isValid(k) {
  if (!k || typeof k !== 'string') return false;
  const parts = k.split('.');
  if (parts.length !== 3) return false;
  return parts.every(part => isValidPart(part));
}

function deriveUserHash(kouling) {
  if (!isValid(kouling)) throw new Error('invalid format');
  return sha256Hex(kouling + ':id');
}

function deriveSyncToken(kouling) {
  if (!isValid(kouling)) throw new Error('invalid format');
  return sha256Hex(kouling + ':auth');
}

const testCases = [
  'loong.888.abc',
  '诗藏.唐.001',
  '文脉.宋.999',
  '🐉.⚔️.📜',
  'user.p@ss.123',
  'a.b.c',
  '一二三四五六七八.12345678.标点!@#$'
];

console.log('--- Testing LoongIdentity Validation & Hash Consistency ---');
let allPassed = true;

for (const tc of testCases) {
  if (!isValid(tc)) {
    console.error(`FAIL: Valid kouling rejected: ${tc}`);
    allPassed = false;
  }
  const uHash = deriveUserHash(tc);
  const sToken = deriveSyncToken(tc);

  // Cross-check against Node's crypto
  const expectedUserHash = crypto.createHash('sha256').update(Buffer.from(tc + ':id', 'utf8')).digest('hex');
  const expectedSyncToken = crypto.createHash('sha256').update(Buffer.from(tc + ':auth', 'utf8')).digest('hex');

  if (uHash !== expectedUserHash) {
    console.error(`FAIL: userHash mismatch for ${tc}: got ${uHash}, exp ${expectedUserHash}`);
    allPassed = false;
  }
  if (sToken !== expectedSyncToken) {
    console.error(`FAIL: syncToken mismatch for ${tc}: got ${sToken}, exp ${expectedSyncToken}`);
    allPassed = false;
  }
  console.log(`[PASS] ${tc}\n       -> UserHash:  ${uHash.slice(0, 16)}...\n       -> SyncToken: ${sToken.slice(0, 16)}...`);
}

const invalidCases = [
  'too.few',
  'too.many.parts.here',
  'toolongpart123456789.a.b',
  '超长汉字部分一二三四五六七八九十.a.b',
  '',
  'a..b'
];

for (const ic of invalidCases) {
  if (isValid(ic)) {
    console.error(`FAIL: Invalid kouling accepted: ${ic}`);
    allPassed = false;
  } else {
    console.log(`[PASS] correctly rejected invalid: "${ic}"`);
  }
}

// Test Masking (like phone numbers)
function mask(kouling, mode = 'center') {
  if (!isValid(kouling)) return '***.***.***';
  const parts = kouling.split('.');
  if (mode === 'tail-mask') {
    return `${parts[0]}.***.***`;
  }
  return `${parts[0]}.***.${parts[2]}`;
}

const masked1 = mask('loong.888.abc', 'center');
if (masked1 !== 'loong.***.abc') {
  console.error(`FAIL: Mask center mismatch: ${masked1}`);
  allPassed = false;
} else {
  console.log(`[PASS] mask(loong.888.abc, center) -> ${masked1}`);
}

const masked2 = mask('loong.888.abc', 'tail-mask');
if (masked2 !== 'loong.***.***') {
  console.error(`FAIL: Mask tail-mask mismatch: ${masked2}`);
  allPassed = false;
} else {
  console.log(`[PASS] mask(loong.888.abc, tail-mask) -> ${masked2}`);
}

// Test cleanInput
function cleanInput(input) {
  if (!input || typeof input !== 'string') return '';
  return input.trim().replace(/[。·]/g, '.');
}

const cleaned = cleanInput('  诗藏。唐·001  ');
if (cleaned !== '诗藏.唐.001') {
  console.error(`FAIL: cleanInput mismatch: ${cleaned}`);
  allPassed = false;
} else {
  console.log(`[PASS] cleanInput('  诗藏。唐·001  ') -> ${cleaned}`);
}

if (!allPassed) {
  process.exit(1);
}
console.log('All LoongIdentity test vectors passed successfully!');


