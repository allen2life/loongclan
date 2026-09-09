/**
 * 龙族三维通行证口令工具 (LoongPass Tool)
 * 遵从 SPEC_IDENTITY v1.1.0 铁律：
 * 1. 纯前端运行，本地 UTF-8 字节流编码 + SHA-256 (NIST FIPS 180-4) 单向散列，零数据上传；
 * 2. 双重确定性哈希派生：UserHash (:id) 作为公开身份标识，SyncToken (:auth) 作为私密鉴权密文；
 * 3. 界面三独立输入框，默认密码掩码，配眼睛显隐切换；
 * 4. 支持智能跳格、退格回退与粘贴自动拆分；
 * 5. 每段 1~8 字符任意符号（汉字、字母、数字、特殊符号、Emoji）；
 * 6. 回显默认部分脱敏（类似手机号脱敏），配眼睛显隐与安全复制。
 */

(function () {
  // SHA-256 常量表
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
    const chars = [...trimmed];
    return chars.length >= 1 && chars.length <= 8 && !trimmed.includes('.');
  }

  function isValidKouling(kouling) {
    if (!kouling || typeof kouling !== 'string') return false;
    const parts = kouling.split('.');
    if (parts.length !== 3) return false;
    return parts.every(p => isValidPart(p));
  }

  function cleanInput(input) {
    if (!input || typeof input !== 'string') return '';
    return input.trim().replace(/[。·]/g, '.');
  }

  function mask(kouling) {
    if (!isValidKouling(kouling)) return '***.***.***';
    const parts = kouling.split('.');
    return `${parts[0]}.***.${parts[2]}`;
  }

  function deriveUserHash(kouling) {
    if (!isValidKouling(kouling)) return '';
    return sha256Hex(kouling + ':id');
  }

  function deriveSyncToken(kouling) {
    if (!isValidKouling(kouling)) return '';
    return sha256Hex(kouling + ':auth');
  }

  function generateRandomKouling(prefix = 'loong') {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    const randChunk = (len) => {
      let res = '';
      for (let i = 0; i < len; i++) {
        res += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return res;
    };
    return `${prefix}.${randChunk(4)}.${randChunk(4)}`;
  }

  // 初始化 DOM 绑定
  window.initKoulingTool = function () {
    const inputK1 = document.getElementById('pass-k1');
    const inputK2 = document.getElementById('pass-k2');
    const inputK3 = document.getElementById('pass-k3');
    const btnToggleInputMask = document.getElementById('btn-toggle-input-mask');
    const btnGen = document.getElementById('btn-gen-pass');
    const btnCopy = document.getElementById('btn-copy-pass');
    const statusEl = document.getElementById('pass-status');
    const displayBox = document.getElementById('pass-display-box');
    const displayKouling = document.getElementById('pass-display-kouling');
    const btnToggleDisplayMask = document.getElementById('btn-toggle-display-mask');
    const hashContainer = document.getElementById('pass-hash-container');
    const hashOutput = document.getElementById('pass-hash-output');
    const tokenContainer = document.getElementById('pass-token-container');
    const tokenOutput = document.getElementById('pass-token-output');

    if (!inputK1 || !inputK2 || !inputK3) return;

    const isZh = document.documentElement.lang && document.documentElement.lang.startsWith('zh');
    let inputMasked = true;
    let displayMasked = true;

    // 默认设置为 password 模式
    inputs = [inputK1, inputK2, inputK3];
    inputs.forEach(inp => { inp.type = 'password'; });

    function getCombinedKouling() {
      const p1 = (inputK1.value || '').trim();
      const p2 = (inputK2.value || '').trim();
      const p3 = (inputK3.value || '').trim();
      if (!p1 && !p2 && !p3) return '';
      return `${p1}.${p2}.${p3}`;
    }

    function update() {
      const kouling = getCombinedKouling();
      if (!kouling) {
        statusEl.textContent = isZh
          ? '请输入或生成三段式口令 (如 loong.888.abc)'
          : 'Enter or generate a 3-part passphrase (e.g. loong.888.abc)';
        statusEl.className = 'pass-status pass-idle';
        if (displayBox) displayBox.style.display = 'none';
        if (hashContainer) hashContainer.style.display = 'none';
        if (tokenContainer) tokenContainer.style.display = 'none';
        return;
      }

      if (isValidKouling(kouling)) {
        const uHash = deriveUserHash(kouling);
        const sToken = deriveSyncToken(kouling);

        statusEl.textContent = isZh
          ? '✓ 口令格式合法 · 双重确定性哈希已派生 (SHA-256)'
          : '✓ Valid passphrase · Dual SHA-256 hashes derived';
        statusEl.className = 'pass-status pass-valid';

        if (displayBox && displayKouling) {
          displayBox.style.display = 'flex';
          displayKouling.textContent = displayMasked ? mask(kouling) : kouling;
        }

        if (hashContainer && hashOutput) {
          hashOutput.textContent = uHash;
          hashContainer.style.display = 'block';
        }

        if (tokenContainer && tokenOutput) {
          tokenOutput.textContent = sToken;
          tokenContainer.style.display = 'block';
        }
      } else {
        statusEl.textContent = isZh
          ? '✕ 格式错误：每段须为 1~8 字符（支持任意汉字、字母、数字、特殊符号与Emoji，不得含半角点号）'
          : '✕ Format error: 1-8 chars per part (letters, numbers, symbols, emoji; no dots)';
        statusEl.className = 'pass-status pass-invalid';
        if (displayBox) displayBox.style.display = 'none';
        if (hashContainer) hashContainer.style.display = 'none';
        if (tokenContainer) tokenContainer.style.display = 'none';
      }
    }

    // 三输入框交互：智能跳格、退格导航、点号自动跳转、粘贴自动分段
    inputs.forEach((input, idx) => {
      // 智能输入清洗与跳格
      input.addEventListener('input', () => {
        const val = input.value;
        if (val.includes('.') || val.includes('。') || val.includes('·')) {
          const cleaned = cleanInput(val);
          const parts = cleaned.split('.');
          input.value = (parts[0] || '').slice(0, 8);
          if (parts.length > 1 && idx < inputs.length - 1) {
            inputs[idx + 1].value = (parts[1] || '').slice(0, 8);
            if (parts.length > 2 && idx < inputs.length - 2) {
              inputs[idx + 2].value = (parts[2] || '').slice(0, 8);
            }
            inputs[idx + 1].focus();
          }
          update();
          return;
        }

        if ([...input.value].length >= 8 && idx < inputs.length - 1) {
          inputs[idx + 1].focus();
        }
        update();
      });

      // 退格智能回退
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && input.value.length === 0 && idx > 0) {
          inputs[idx - 1].focus();
        }
      });

      // 粘贴智能分段解析
      input.addEventListener('paste', (e) => {
        const text = (e.clipboardData || window.clipboardData)?.getData('text');
        if (!text) return;
        const cleaned = cleanInput(text);
        if (cleaned.includes('.')) {
          e.preventDefault();
          const parts = cleaned.split('.');
          if (parts.length >= 2) {
            inputK1.value = [...(parts[0] || '').trim()].slice(0, 8).join('');
            inputK2.value = [...(parts[1] || '').trim()].slice(0, 8).join('');
            inputK3.value = [...(parts[2] || '').trim()].slice(0, 8).join('');
            if (inputK3.value) {
              inputK3.focus();
            } else if (inputK2.value) {
              inputK3.focus();
            } else {
              inputK2.focus();
            }
            update();
          }
        }
      });
    });

    // 输入框密码遮罩显隐切换
    if (btnToggleInputMask) {
      btnToggleInputMask.addEventListener('click', () => {
        inputMasked = !inputMasked;
        const newType = inputMasked ? 'password' : 'text';
        inputs.forEach(inp => { inp.type = newType; });
        btnToggleInputMask.textContent = inputMasked ? '👁️' : '🙈';
        btnToggleInputMask.title = inputMasked
          ? (isZh ? '显示明文' : 'Show plaintext')
          : (isZh ? '隐藏为密码' : 'Hide as password');
      });
    }

    // 回显展示区遮罩显隐切换
    if (btnToggleDisplayMask) {
      btnToggleDisplayMask.addEventListener('click', () => {
        displayMasked = !displayMasked;
        btnToggleDisplayMask.textContent = displayMasked ? '👁️' : '🙈';
        update();
      });
    }

    // 生成随机口令
    if (btnGen) {
      btnGen.addEventListener('click', () => {
        const rand = generateRandomKouling('loong');
        const parts = rand.split('.');
        inputK1.value = parts[0];
        inputK2.value = parts[1];
        inputK3.value = parts[2];
        update();
      });
    }

    // 一键安全复制完整口令
    if (btnCopy) {
      btnCopy.addEventListener('click', () => {
        const kouling = getCombinedKouling();
        if (!isValidKouling(kouling)) return;
        navigator.clipboard.writeText(kouling).then(() => {
          const oldText = btnCopy.textContent;
          btnCopy.textContent = isZh ? '✓ 口令已复制，请妥善保管！' : '✓ Passphrase copied, keep safe!';
          setTimeout(() => { btnCopy.textContent = oldText; }, 2500);
        });
      });
    }

    // 默认生成一个示例口令
    const initial = generateRandomKouling('loong');
    const initParts = initial.split('.');
    inputK1.value = initParts[0];
    inputK2.value = initParts[1];
    inputK3.value = initParts[2];
    update();
  };

  document.addEventListener('DOMContentLoaded', () => {
    if (window.initKoulingTool) {
      window.initKoulingTool();
    }
  });
})();
