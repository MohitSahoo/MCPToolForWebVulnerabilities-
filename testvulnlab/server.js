const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const querystring = require('querystring');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Native node SQLite is available in Node 22+
let db;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(':memory:');
  // Seed database
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      password TEXT,
      role TEXT,
      bio TEXT,
      api_key TEXT
    );
    CREATE TABLE guestbook (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      author TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    INSERT INTO users (username, password, role, bio, api_key) VALUES 
      ('admin', 'AdminPass123!', 'admin', 'Root administrator of VulnLab', 'sk_live_51NvYtZ8e1Lp2q0x8_secret_admin_key_99'),
      ('john', 'johnny99', 'user', 'Software security diagnostics developer', 'sk_live_38BxKm5w2Qv7n3p1_john_api_key_47'),
      ('alice', 'wonderland', 'user', 'QA auditing script engineer', 'sk_live_12AsFp4d9Rz3x0c2_alice_api_key_11');
    INSERT INTO guestbook (author, content) VALUES
      ('alice', 'This in-memory zero-dependency database works perfectly!'),
      ('john', 'Awesome UI, starts instantly.');
  `);
} catch (e) {
  console.error('Failed to initialize node:sqlite:', e.message);
  // Fallback mock DB object if sqlite failed
  db = {
    prepare: (sql) => ({
      all: (...args) => {
        if (sql.includes('users') && sql.includes('OR')) return [{ id: 1, username: 'admin', password: 'AdminPass123!', role: 'admin', bio: 'SQLi Fallback Admin Account', api_key: 'sk_live_fake' }];
        return [{ id: 1, username: 'john', bio: 'Fallback user info' }];
      },
      get: (...args) => {
        if (sql.includes('users')) return { id: 1, username: 'admin', password: 'AdminPass123!', role: 'admin', bio: 'SQLi Fallback Admin Account' };
        return null;
      },
      run: (...args) => ({})
    })
  };
}

const PORT = Number(process.env.PORT || 3003);

// Static/Dynamic Dashboard HTML with sleek glassmorphism dark theme
const getDashboardHTML = (reflectedXSS = '', sqlResults = '', guestbookComments = []) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VulnLab Dashboard</title>
  <style>
    :root {
      --bg: #0b0f19;
      --card-bg: rgba(17, 24, 39, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --primary: #8b5cf6;
      --primary-hover: #a78bfa;
      --accent: #f43f5e;
      --accent-green: #10b981;
    }
    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      background: var(--bg);
      color: var(--text);
      margin: 0;
      padding: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      border-bottom: 1px solid var(--border);
      padding: 20px 40px;
      backdrop-filter: blur(12px);
      background: rgba(11, 15, 25, 0.8);
      position: sticky;
      top: 0;
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    h1 {
      margin: 0;
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, #a78bfa, #f43f5e);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .badge {
      background: rgba(244, 63, 94, 0.15);
      color: var(--accent);
      padding: 4px 12px;
      border-radius: 9999px;
      font-size: 12px;
      font-weight: 600;
      border: 1px solid rgba(244, 63, 94, 0.3);
    }
    main {
      flex: 1;
      max-width: 1200px;
      margin: 40px auto;
      padding: 0 20px;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 30px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 24px;
      backdrop-filter: blur(16px);
      box-shadow: 0 4px 30px rgba(0, 0, 0, 0.2);
    }
    .card-title {
      font-size: 18px;
      font-weight: 600;
      margin-top: 0;
      margin-bottom: 16px;
      color: var(--primary-hover);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .form-group {
      margin-bottom: 16px;
    }
    label {
      display: block;
      margin-bottom: 8px;
      font-size: 14px;
      color: var(--text-muted);
    }
    input[type="text"], textarea {
      width: 100%;
      padding: 10px 14px;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid var(--border);
      border-radius: 8px;
      color: var(--text);
      box-sizing: border-box;
      transition: all 0.2s;
    }
    input[type="text"]:focus, textarea:focus {
      outline: none;
      border-color: var(--primary);
      box-shadow: 0 0 0 2px rgba(139, 92, 246, 0.2);
    }
    .btn {
      background: var(--primary);
      color: #fff;
      border: none;
      padding: 10px 20px;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .output-box {
      margin-top: 16px;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 14px;
      font-family: 'Courier New', Courier, monospace;
      font-size: 14px;
      overflow-x: auto;
      max-height: 250px;
    }
    .comment-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .comment-item {
      background: rgba(255, 255, 255, 0.03);
      padding: 12px;
      border-radius: 8px;
      border-left: 3px solid var(--primary);
    }
    .comment-meta {
      font-size: 12px;
      color: var(--text-muted);
      margin-bottom: 6px;
    }
    .footer {
      text-align: center;
      padding: 30px;
      color: var(--text-muted);
      border-top: 1px solid var(--border);
      font-size: 14px;
    }
  </style>
</head>
<body>
  <header>
    <h1>🛡️ VulnLab v2.0 (Lightweight)</h1>
    <span class="badge">Vulnerability Lab Mode</span>
  </header>
  <main>
    <!-- Section: Search (Reflected XSS) -->
    <div class="card">
      <h2 class="card-title">🔍 Search Console (Reflected XSS)</h2>
      <form action="/" method="GET">
        <div class="form-group">
          <label for="q">Query</label>
          <input type="text" id="q" name="q" placeholder="Enter keywords..." value="">
        </div>
        <button type="submit" class="btn">Search</button>
      </form>
      ${reflectedXSS ? `<div class="output-box">Results for: ${reflectedXSS}</div>` : ''}
    </div>

    <!-- Section: SQLi Injection Sandbox -->
    <div class="card">
      <h2 class="card-title">🗄️ User Directory Lookup (SQLi)</h2>
      <form action="/" method="GET">
        <div class="form-group">
          <label for="id">User ID (Vulnerable ID Parameter)</label>
          <input type="text" id="id" name="id" placeholder="e.g. 1 OR 1=1">
        </div>
        <button type="submit" class="btn">Lookup User</button>
      </form>
      ${sqlResults ? `<div class="output-box">${sqlResults}</div>` : ''}
    </div>

    <!-- Section: Guestbook (Stored XSS) -->
    <div class="card" style="grid-column: span 2;">
      <h2 class="card-title">📝 Guestbook Board (Stored XSS)</h2>
      <form action="/guestbook" method="POST" style="margin-bottom: 24px;">
        <div class="form-group">
          <label for="author">Name</label>
          <input type="text" id="author" name="author" required placeholder="Alice">
        </div>
        <div class="form-group">
          <label for="content">Comment (Renders HTML Raw)</label>
          <textarea id="content" name="content" rows="3" required placeholder="Type something..."></textarea>
        </div>
        <button type="submit" class="btn">Post Comment</button>
      </form>
      
      <div class="comment-list">
        ${guestbookComments.map(c => `
          <div class="comment-item">
            <div class="comment-meta">By <strong>${c.author}</strong> on ${c.created_at}</div>
            <div>${c.content}</div>
          </div>
        `).join('')}
      </div>
    </div>
  </main>
  <footer class="footer">
    VulnLab is running in lightweight dependency-free mode at http://localhost:${PORT}
  </footer>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const method = req.method;

  // ─── VULNERABILITY: Missing Security Headers & Verbose Server Header ────────
  res.setHeader('X-Powered-By', 'PHP/7.4.3 (Ubuntu)');
  res.setHeader('Server', 'Apache/2.4.41 (Ubuntu)');

  // ─── VULNERABILITY: CORS Misconfiguration ────────
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // ─── Static Files & Simulated Sensitive files ────────
  
  // robots.txt
  if (parsedUrl.pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`User-agent: *
Disallow: /admin
Disallow: /.env
Disallow: /git-dumper
Disallow: /api/view-file
`);
    return;
  }

  // security.txt
  if (parsedUrl.pathname === '/security.txt' || parsedUrl.pathname === '/.well-known/security.txt') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`Contact: mailto:security@vulnlab.local
Expires: 2029-12-01T00:00:00.000Z
Policy: http://localhost:3003/security-policy`);
    return;
  }

  // /.env file disclosure
  if (parsedUrl.pathname === '/.env') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`DB_HOST=localhost
DB_USER=vulnadmin
DB_PASS=SuperSecureDBPassword2026!
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
JWT_SECRET=supersecretkeyshouldbechanged
`);
    return;
  }

  // Simulated Git Config LFI / OSINT
  if (parsedUrl.pathname === '/.git/config') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(`[core]
\trepositoryformatversion = 0
\tfilemode = true
\tbare = false
\tlogallrefupdates = true
\tignorecase = true
\tprecomposeunicode = true
[remote "origin"]
\turl = https://github.com/vulnlab/vulnerable-app.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`);
    return;
  }

  // ─── VULNERABILITY: Local File Inclusion & Directory Traversal ────────
  if (parsedUrl.pathname === '/api/view-file') {
    const file = parsedUrl.query.file;
    if (!file) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing file parameter');
      return;
    }
    // Vulnerable: no validation, direct concatenation
    const filePath = path.join(__dirname, file);
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(data);
    } catch (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end(`File not found: ${err.message}`);
    }
    return;
  }

  // ─── VULNERABILITY: Command Injection ────────
  if (parsedUrl.pathname === '/api/ping') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = querystring.parse(body);
      const host = params.host || parsedUrl.query.host;
      if (!host) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Missing host parameter');
        return;
      }

      try {
        // Vulnerable: raw shell execution
        const out = execSync(`ping -c 2 ${host}`, { timeout: 5000 }).toString();
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(out);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end(`Execution failure: ${err.message}\nOutput: ${err.stderr ? err.stderr.toString() : ''}`);
      }
    });
    return;
  }

  // ─── VULNERABILITY: GraphQL Introspection Endpoint ────────
  if (parsedUrl.pathname === '/graphql') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      data: {
        __schema: {
          queryType: { name: 'Query' },
          types: [
            { name: 'Query', kind: 'OBJECT' },
            { name: 'User', kind: 'OBJECT' },
            { name: 'SecretCredential', kind: 'OBJECT' }
          ]
        }
      }
    }));
    return;
  }

  // ─── VULNERABILITY: Open Redirect ────────
  if (parsedUrl.pathname === '/redirect') {
    const target = parsedUrl.query.url;
    if (target) {
      res.writeHead(302, { 'Location': target });
      res.end();
    } else {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('Missing url parameter');
    }
    return;
  }

  // ─── VULNERABILITY: Server Side Template Injection (SSTI) ────────
  if (parsedUrl.pathname === '/api/render') {
    const template = parsedUrl.query.template || '';
    try {
      // Vulnerable: uses eval to mock custom template engine rendering
      const rendered = eval('`' + template.replace(/`/g, '\\`') + '`');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(rendered);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(`Template error: ${err.message}`);
    }
    return;
  }

  // ─── VULNERABILITY: Weak JWT & Bypass Validation ────────
  if (parsedUrl.pathname === '/api/jwt-auth') {
    const authHeader = req.headers.authorization || '';
    const token = parsedUrl.query.token || authHeader.split(' ')[1];
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Auth token required' }));
      return;
    }
    try {
      const parts = token.split('.');
      if (parts.length < 2) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid token structure' }));
        return;
      }
      const header = JSON.parse(Buffer.from(parts[0], 'base64').toString());
      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      if (header.alg === 'none') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ authenticated: true, method: 'alg=none bypass', user: payload }));
        return;
      }
      
      // Verification using weak secret 'secret'
      if (parts.length === 3) {
        const signInput = parts[0] + '.' + parts[1];
        const expectedSig = crypto.createHmac('sha256', 'secret').update(signInput).digest('base64url');
        if (parts[2] === expectedSig || parts[2].replace(/=/g, '') === expectedSig) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ authenticated: true, method: 'weak key check', user: payload }));
          return;
        }
      }
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid signature' }));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // Guestbook comments route (POST)
  if (parsedUrl.pathname === '/guestbook' && method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      const params = querystring.parse(body);
      const author = params.author || 'Anonymous';
      const content = params.content || '';
      
      try {
        if (db.run) {
          db.run(`INSERT INTO guestbook (author, content) VALUES ('${author.replace(/'/g, "''")}', '${content}')`);
        } else {
          // sqlite fallbacks
          const stmt = db.prepare("INSERT INTO guestbook (author, content) VALUES (?, ?)");
          stmt.run(author, content);
        }
      } catch (err) {
        console.error('Failed to post comment:', err.message);
      }
      res.writeHead(302, { 'Location': '/' });
      res.end();
    });
    return;
  }

  // Dashboard page
  if (parsedUrl.pathname === '/') {
    // ─── SQL Injection (SQLi) handling ────────
    let sqlResults = '';
    const userId = parsedUrl.query.id;
    if (userId) {
      try {
        let rows = [];
        if (db.prepare) {
          // Vulnerable SQL concatenation
          const queryStr = `SELECT * FROM users WHERE id = ${userId}`;
          // node:sqlite returns StatementSync
          const stmt = db.prepare(queryStr);
          rows = stmt.all();
        }
        sqlResults = rows.length > 0 
          ? `<h3>Users Found:</h3><pre>${JSON.stringify(rows, null, 2)}</pre>`
          : 'No users found matching that query.';
      } catch (err) {
        sqlResults = `<span style="color: var(--accent);">SQL Error: ${err.message}</span>`;
      }
    }

    // Reflected XSS parameter
    const reflectedXSS = parsedUrl.query.q || '';

    // Fetch guestbook comments
    let guestbookComments = [];
    try {
      if (db.prepare) {
        const stmt = db.prepare('SELECT * FROM guestbook ORDER BY id DESC');
        guestbookComments = stmt.all() || [];
      }
    } catch (e) {
      guestbookComments = [];
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(getDashboardHTML(reflectedXSS, sqlResults, guestbookComments));
    return;
  }

  // 404
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`VulnLab lightweight server listening at http://localhost:${PORT}`);
});
