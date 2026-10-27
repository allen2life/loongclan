import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { syncRoutes } from './routes/sync.ts';
import { rankRoutes } from './routes/rank.ts';
import { adminRoutes } from './routes/admin.ts';
import { D1Store } from './db/store.ts';

type Bindings = {
  DB: D1Database;
  ADMIN_KEY?: string;
  ADMIN_USERNAME?: string;
  ALLOWED_ORIGINS?: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ── 数据表结构自愈（幂等，进程内只跑一次） ──
let columnsEnsured = false;
app.use('*', async (c, next) => {
  if (!columnsEnsured) {
    columnsEnsured = true;
    try {
      await new D1Store(c.env.DB).ensureColumns();
    } catch {
      // 迁移失败不阻断请求，UPDATE 路径另有兼容兜底
    }
  }
  await next();
});

// ── 全局 CORS 中间件 ──
app.use('*', async (c, next) => {
  const allowed = (c.env.ALLOWED_ORIGINS || '*').split(',').map(s => s.trim());
  const origin = c.req.header('Origin') || '*';
  const isAllowed = allowed.includes('*') || allowed.includes(origin);

  const corsMiddleware = cors({
    origin: isAllowed ? origin : allowed[0],
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Admin-Token', 'X-Requested-With'],
    credentials: origin !== '*'
  });

  return corsMiddleware(c, next);
});

// ── 基础健康检查 ──
app.get('/', (c) => {
  return c.json({
    brand: 'LoongClan Platform (龙族，loongclan.xyz)',
    version: '1.0.0',
    status: 'online',
    docs: 'https://loongclan.xyz/docs',
    endpoints: {
      sync: '/api/v1/sync',
      rank: '/api/v1/rank',
      admin: '/api/admin',
      console: '/admin/'
    }
  });
});

app.get('/health', (c) => c.json({ status: 'ok', timestamp: Date.now() }));

// ── 路由挂载 ──
app.route('/api/v1/sync', syncRoutes);
app.route('/api/v1/rank', rankRoutes);
app.route('/api/admin', adminRoutes);

// ── 内置管理界面 (SPA) ──
app.get('/admin', (c) => c.redirect('/admin/'));
app.get('/admin/*', async (c) => {
  // 返回嵌入式管理控制台 HTML
  return c.html(getAdminHtml());
});

function getAdminHtml() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>龙族控制台 · LoongClan Console</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;900&family=JetBrains+Mono:wght@400;600&family=Noto+Sans+SC:wght@300;400;500&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #0d1117;
      --panel: #161b22;
      --border: #30363d;
      --text: #c9d1d9;
      --text-dim: #8b949e;
      --accent: #d97706;
      --accent-rgb: 217, 119, 6;
      --dragon-red: #dc2626;
      --green: #10b981;
      --card-bg: #1b212c;
      --font-serif: 'Noto Serif SC', serif;
      --font-mono: 'JetBrains Mono', monospace;
      --font-sans: 'Noto Sans SC', sans-serif;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      background: var(--panel);
      border-bottom: 1px solid var(--border);
      padding: 12px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 10px;
      font-family: var(--font-serif);
      font-size: 1.25rem;
      font-weight: 900;
      color: #f3f4f6;
      letter-spacing: 1px;
    }
    .brand-tag {
      font-size: 0.75rem;
      background: rgba(217, 119, 6, 0.2);
      color: var(--accent);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(217, 119, 6, 0.4);
      font-family: var(--font-mono);
    }
    .nav-tabs {
      display: flex;
      gap: 8px;
    }
    .tab-btn {
      background: transparent;
      border: 1px solid transparent;
      color: var(--text-dim);
      padding: 6px 14px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    .tab-btn:hover { color: var(--text); border-color: var(--border); }
    .tab-btn.active {
      background: var(--card-bg);
      color: #f3f4f6;
      border-color: var(--accent);
      font-weight: 500;
    }
    main {
      flex: 1;
      padding: 24px;
      max-width: 1300px;
      margin: 0 auto;
      width: 100%;
    }
    .login-container {
      max-width: 400px;
      margin: 80px auto;
      background: var(--panel);
      padding: 32px;
      border-radius: 8px;
      border: 1px solid var(--border);
      text-align: center;
    }
    .login-container h2 {
      font-family: var(--font-serif);
      margin-bottom: 24px;
      color: #f3f4f6;
    }
    .input-field {
      width: 100%;
      padding: 10px 14px;
      background: var(--bg);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 6px;
      margin-bottom: 16px;
      font-size: 0.95rem;
      outline: none;
    }
    .input-field:focus { border-color: var(--accent); }
    .btn-action {
      background: linear-gradient(135deg, #b45309, #d97706);
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 500;
      width: 100%;
      transition: opacity 0.2s;
    }
    .btn-action:hover { opacity: 0.9; }
    .grid-stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .stat-card {
      background: var(--panel);
      border: 1px solid var(--border);
      padding: 20px;
      border-radius: 8px;
    }
    .stat-label {
      font-size: 0.85rem;
      color: var(--text-dim);
      margin-bottom: 8px;
    }
    .stat-val {
      font-size: 1.8rem;
      font-weight: 700;
      font-family: var(--font-mono);
      color: #f3f4f6;
    }
    .content-box {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 24px;
    }
    .filter-bar {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      flex-wrap: wrap;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 0.9rem;
    }
    th, td {
      padding: 12px 14px;
      text-align: left;
      border-bottom: 1px solid var(--border);
    }
    th { color: var(--text-dim); font-weight: 500; }
    tr:hover { background: rgba(255,255,255,0.02); }
    .mono { font-family: var(--font-mono); font-size: 0.85rem; }
    .badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 0.75rem;
      font-family: var(--font-mono);
      background: rgba(255,255,255,0.06);
    }
    .badge-app { color: #38bdf8; background: rgba(56, 189, 248, 0.1); }
    .btn-sm {
      padding: 4px 10px;
      font-size: 0.75rem;
      border-radius: 4px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text);
      cursor: pointer;
    }
    .btn-danger { color: #ef4444; border-color: rgba(239, 68, 68, 0.3); }
    .btn-danger:hover { background: rgba(239, 68, 68, 0.1); }
    .modal-pre {
      background: var(--bg);
      padding: 12px;
      border-radius: 6px;
      max-height: 400px;
      overflow: auto;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <span>LoongClan Console</span>
      <span class="brand-tag">loongclan.xyz</span>
    </div>
    <div id="nav-section" class="nav-tabs" style="display: none;">
      <button class="tab-btn active" data-tab="stats" onclick="switchTab('stats')"><span class="t-stats">Overview</span></button>
      <button class="tab-btn" data-tab="sync" onclick="switchTab('sync')"><span class="t-sync">Sync Snapshots</span></button>
      <button class="tab-btn" data-tab="rank" onclick="switchTab('rank')"><span class="t-rank">Leaderboard Moderation</span></button>
      <button class="tab-btn" onclick="toggleLang()" style="color: var(--accent);"><span id="lang-indicator">中文</span></button>
      <button class="tab-btn" onclick="logout()" style="color: #ef4444;"><span class="t-logout">Sign Out</span></button>
    </div>
  </header>

  <main id="app-root">
    <!-- Login View -->
    <div id="view-login" class="login-container">
      <h2 class="t-login-title">LoongClan Admin Access</h2>
      <input type="password" id="input-key" class="input-field" placeholder="Enter Admin Secret Key (ADMIN_KEY)">
      <button class="btn-action t-login-btn" onclick="doLogin()">Sign In</button>
      <p id="login-err" style="color: #ef4444; margin-top: 12px; font-size: 0.85rem; display: none;"></p>
    </div>

    <!-- Main Console View -->
    <div id="view-console" style="display: none;">
      <!-- Stats Tab -->
      <section id="tab-stats">
        <div class="grid-stats">
          <div class="stat-card">
            <div class="stat-label t-stat-snapshots">Total Sync Snapshots</div>
            <div id="stat-snapshots" class="stat-val">-</div>
          </div>
          <div class="stat-card">
            <div class="stat-label t-stat-ranks">Leaderboard Records</div>
            <div id="stat-ranks" class="stat-val">-</div>
          </div>
          <div class="stat-card">
            <div class="stat-label t-stat-banned">Banned Hashes</div>
            <div id="stat-banned" class="stat-val">-</div>
          </div>
        </div>
        <div class="content-box">
          <h3 class="t-app-dist" style="margin-bottom: 14px; font-family: var(--font-serif);">Data Distribution by Application</h3>
          <div id="stat-app-counts" style="display: flex; gap: 12px; flex-wrap: wrap;"></div>
        </div>
      </section>

      <!-- Sync Snapshots Tab -->
      <section id="tab-sync" style="display: none;">
        <div class="content-box">
          <div class="filter-bar">
            <input type="text" id="sync-search" class="input-field" style="max-width: 320px; margin-bottom: 0;" placeholder="Search UserHash / Nickname">
            <input type="text" id="sync-app-filter" class="input-field" style="max-width: 160px; margin-bottom: 0;" placeholder="App ID (e.g. words)">
            <button class="btn-action t-query-btn" style="width: auto;" onclick="loadSyncList()">Query Snapshots</button>
          </div>
          <table>
            <thead>
              <tr>
                <th class="th-app">App</th>
                <th class="th-pass">UserHash</th>
                <th class="th-nick">Nickname</th>
                <th class="th-ver">Version</th>
                <th class="th-size">Size</th>
                <th class="th-updated">Updated At</th>
                <th class="th-act">Actions</th>
              </tr>
            </thead>
            <tbody id="sync-tbody"></tbody>
          </table>
        </div>
      </section>

      <!-- Leaderboards Tab -->
      <section id="tab-rank" style="display: none;">
        <div class="content-box">
          <div class="filter-bar">
            <input type="text" id="rank-app" class="input-field" style="max-width: 140px; margin-bottom: 0;" value="xiangqi" placeholder="App ID">
            <input type="text" id="rank-board" class="input-field" style="max-width: 140px; margin-bottom: 0;" value="total" placeholder="Board ID">
            <select id="rank-period" class="input-field" style="max-width: 130px; margin-bottom: 0;">
              <option value="all">All Time</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
            <button class="btn-action t-query-btn" style="width: auto;" onclick="loadRankList()">Query Board</button>
          </div>
          <table>
            <thead>
              <tr>
                <th class="th-rank">Rank</th>
                <th class="th-nick">Player</th>
                <th class="th-score">Score</th>
                <th class="th-stars">Stars</th>
                <th class="th-hash">UserHash</th>
                <th class="th-time">Submitted At</th>
                <th class="th-act">Actions</th>
              </tr>
            </thead>
            <tbody id="rank-tbody"></tbody>
          </table>
        </div>
      </section>
    </div>
  </main>

  <script>
    let token = localStorage.getItem('loongclan_admin_token') || '';
    let currentLang = localStorage.getItem('loongclan_admin_lang') || 'en'; // Default English

    const DICT = {
      en: {
        stats: 'Overview', sync: 'Sync Snapshots', rank: 'Leaderboard Moderation', logout: 'Sign Out',
        loginTitle: 'LoongClan Admin Access', loginBtn: 'Sign In', loginKeyPlaceholder: 'Enter Admin Secret Key (ADMIN_KEY)',
        statSnapshots: 'Total Sync Snapshots', statRanks: 'Leaderboard Records', statBanned: 'Banned Hashes',
        appDist: 'Data Distribution by Application', queryBtn: 'Query',
        thApp: 'App', thPass: 'Passphrase / Hash', thNick: 'Nickname', thVer: 'Version', thSize: 'Size',
        thUpdated: 'Updated At', thAct: 'Actions', thRank: 'Rank', thScore: 'Score', thStars: 'Stars',
        thHash: 'UserHash', thTime: 'Submitted At',
        deleteConfirm: 'Permanently delete this snapshot?', banConfirm: 'Ban this UserHash? Banned users cannot sync or submit scores.',
        deleteBtn: 'Delete', banBtn: 'Ban', noData: 'No records found.', nextLang: '中文'
      },
      zh: {
        stats: '总览概况', sync: '同步快照', rank: '排行榜审查', logout: '退出',
        loginTitle: '龙族中枢登录', loginBtn: '登 录', loginKeyPlaceholder: '请输入管理后台访问密钥 (ADMIN_KEY)',
        statSnapshots: '总同步快照量', statRanks: '排行榜记录总数', statBanned: '已封禁 Hash',
        appDist: '各应用数据分布', queryBtn: '查 询',
        thApp: '应用', thPass: '三维口令 / UserHash', thNick: '昵称', thVer: '版本', thSize: '体积',
        thUpdated: '更新时间', thAct: '操作', thRank: '名次', thScore: '得分', thStars: '星级',
        thHash: 'UserHash', thTime: '提交时间',
        deleteConfirm: '确认永久删除此快照？', banConfirm: '确认封禁此 UserHash？封禁后将无法同步与上榜。',
        deleteBtn: '删除', banBtn: '封禁', noData: '暂无匹配数据。', nextLang: 'English'
      }
    };

    function applyLang() {
      const d = DICT[currentLang];
      document.querySelectorAll('.t-stats').forEach(el => el.textContent = d.stats);
      document.querySelectorAll('.t-sync').forEach(el => el.textContent = d.sync);
      document.querySelectorAll('.t-rank').forEach(el => el.textContent = d.rank);
      document.querySelectorAll('.t-logout').forEach(el => el.textContent = d.logout);
      document.querySelectorAll('.t-login-title').forEach(el => el.textContent = d.loginTitle);
      document.querySelectorAll('.t-login-btn').forEach(el => el.textContent = d.loginBtn);
      document.querySelectorAll('.t-stat-snapshots').forEach(el => el.textContent = d.statSnapshots);
      document.querySelectorAll('.t-stat-ranks').forEach(el => el.textContent = d.statRanks);
      document.querySelectorAll('.t-stat-banned').forEach(el => el.textContent = d.statBanned);
      document.querySelectorAll('.t-app-dist').forEach(el => el.textContent = d.appDist);
      document.querySelectorAll('.t-query-btn').forEach(el => el.textContent = d.queryBtn);
      const indicator = document.getElementById('lang-indicator');
      if (indicator) indicator.textContent = d.nextLang;
    }

    function toggleLang() {
      currentLang = currentLang === 'en' ? 'zh' : 'en';
      localStorage.setItem('loongclan_admin_lang', currentLang);
      applyLang();
      if (document.getElementById('tab-sync').style.display !== 'none') loadSyncList();
      if (document.getElementById('tab-rank').style.display !== 'none') loadRankList();
    }

    async function apiReq(path, method = 'GET', body = null) {
      const headers = { 'Authorization': 'Bearer ' + token };
      if (body) headers['Content-Type'] = 'application/json';
      const res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null
      });
      if (res.status === 401) {
        logout();
        throw new Error('Unauthorized');
      }
      return res.json();
    }

    async function doLogin() {
      const key = document.getElementById('input-key').value.trim();
      const errEl = document.getElementById('login-err');
      errEl.style.display = 'none';

      try {
        const res = await fetch('/api/admin/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: key })
        });
        const data = await res.json();
        if (data.code === 0 && data.data?.token) {
          token = data.data.token;
          localStorage.setItem('loongclan_admin_token', token);
          showConsole();
        } else {
          errEl.textContent = data.message || '登录失败';
          errEl.style.display = 'block';
        }
      } catch (e) {
        errEl.textContent = '网络连接错误';
        errEl.style.display = 'block';
      }
    }

    function logout() {
      token = '';
      localStorage.removeItem('loongclan_admin_token');
      document.getElementById('view-login').style.display = 'block';
      document.getElementById('view-console').style.display = 'none';
      document.getElementById('nav-section').style.display = 'none';
    }

    function showConsole() {
      document.getElementById('view-login').style.display = 'none';
      document.getElementById('view-console').style.display = 'block';
      document.getElementById('nav-section').style.display = 'flex';
      switchTab('stats');
    }

    function switchTab(tab) {
      document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
      ['stats', 'sync', 'rank'].forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.style.display = (t === tab) ? 'block' : 'none';
      });
      event?.target?.classList.add('active');

      if (tab === 'stats') loadStats();
      if (tab === 'sync') loadSyncList();
      if (tab === 'rank') loadRankList();
    }

    async function loadStats() {
      try {
        const res = await apiReq('/api/admin/stats');
        if (res.code === 0) {
          document.getElementById('stat-snapshots').textContent = res.data.totalSnapshots;
          document.getElementById('stat-ranks').textContent = res.data.totalRankScores;
          document.getElementById('stat-banned').textContent = res.data.totalBanned;

          const appsDiv = document.getElementById('stat-app-counts');
          appsDiv.innerHTML = '';
          for (const [app, cnt] of Object.entries(res.data.appCounts || {})) {
            appsDiv.innerHTML += \`<span class="badge badge-app" style="font-size: 0.9rem; padding: 6px 12px;">\${app}: \${cnt} 份存档</span>\`;
          }
        }
      } catch(e) {}
    }

    async function loadSyncList() {
      const q = document.getElementById('sync-search').value.trim();
      const app = document.getElementById('sync-app-filter').value.trim();
      const tbody = document.getElementById('sync-tbody');
      const d = DICT[currentLang];
      tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

      try {
        const res = await apiReq(\`/api/admin/sync/list?q=\${encodeURIComponent(q)}&appId=\${encodeURIComponent(app)}\`);
        if (res.code === 0 && res.data?.list) {
          tbody.innerHTML = '';
          if (res.data.list.length === 0) {
            tbody.innerHTML = \`<tr><td colspan="7" style="color: var(--text-dim);">\${d.noData}</td></tr>\`;
            return;
          }
          res.data.list.forEach(row => {
            tbody.innerHTML += \`
              <tr>
                <td><span class="badge badge-app">\${row.app_id}</span></td>
                <td>
                  <div class="mono" style="color:var(--accent); font-weight:600;">\${row.user_hash.slice(0, 16)}...</div>
                </td>
                <td><b>\${row.nickname || '-'}</b></td>
                <td class="mono">v\${row.version}</td>
                <td class="mono">\${row.size} B</td>
                <td style="font-size: 0.8rem; color: var(--text-dim);">\${new Date(row.updated_at).toLocaleString()}</td>
                <td>
                  <button class="btn-sm btn-danger" onclick="deleteSync('\${row.app_id}', '\${row.user_hash}')">\${d.deleteBtn}</button>
                  <button class="btn-sm btn-danger" onclick="banUser('\${row.user_hash}')">\${d.banBtn}</button>
                </td>
              </tr>
            \`;
          });
        }
      } catch(e) {}
    }

    function init() {
      applyLang();
      if (token) {
        showConsole();
      } else {
        document.getElementById('view-login').style.display = 'block';
        document.getElementById('view-console').style.display = 'none';
        document.getElementById('nav-section').style.display = 'none';
      }
    }

    async function deleteSync(appId, userHash) {
      const d = DICT[currentLang];
      if (!confirm(d.deleteConfirm)) return;
      await apiReq('/api/admin/sync/delete', 'POST', { appId, userHash });
      loadSyncList();
    }

    async function banUser(userHash) {
      const d = DICT[currentLang];
      if (!confirm(d.banConfirm)) return;
      await apiReq('/api/admin/user/ban', 'POST', { userHash, reason: 'Manual ban from admin console' });
      alert(currentLang === 'en' ? 'User has been banned.' : '已封禁');
    }

    async function loadRankList() {
      const appId = document.getElementById('rank-app').value.trim();
      const boardId = document.getElementById('rank-board').value.trim();
      const period = document.getElementById('rank-period').value;
      const tbody = document.getElementById('rank-tbody');
      const d = DICT[currentLang];
      tbody.innerHTML = '<tr><td colspan="7">Loading...</td></tr>';

      try {
        const res = await apiReq(\`/api/admin/rank/list?appId=\${encodeURIComponent(appId)}&boardId=\${encodeURIComponent(boardId)}&period=\${encodeURIComponent(period)}\`);
        if (res.code === 0 && res.data?.list) {
          tbody.innerHTML = '';
          if (res.data.list.length === 0) {
            tbody.innerHTML = \`<tr><td colspan="7" style="color: var(--text-dim);">\${d.noData}</td></tr>\`;
            return;
          }
          res.data.list.forEach(row => {
            tbody.innerHTML += \`
              <tr>
                <td><b>#\${row.rank}</b></td>
                <td>\${row.nickname || 'Player'}</td>
                <td class="mono" style="color: var(--accent); font-weight: 700;">\${row.score}</td>
                <td>\${'★'.repeat(row.stars || 0)}</td>
                <td class="mono" style="color: var(--text-dim);">\${row.userHash.slice(0, 16)}...</td>
                <td style="font-size: 0.8rem; color: var(--text-dim);">\${new Date(row.publishTime).toLocaleString()}</td>
                <td>
                  <button class="btn-sm btn-danger" onclick="banUser('\${row.userHash}')">\${d.banBtn}</button>
                </td>
              </tr>
            \`;
          });
        }
      } catch(e) {}
    }

    init();
  </script>
</body>
</html>`;
}

export default app;
