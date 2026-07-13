# 🛡️ testvulnlab (Lightweight Deliberately Vulnerable App)

A zero-dependency deliberately vulnerable web application designed to run instantly and efficiently under any environment (including iCloud-synced directories). It uses Node v22 native modules (including `node:sqlite`) and requires absolutely NO external dependencies (`node_modules`).

## 🚀 Quick Start

1. **Start the application:**
   ```bash
   node server.js
   ```
   Or using npm:
   ```bash
   npm start
   ```

2. **Access the application:**
   Open [http://localhost:3003](http://localhost:3003) in your browser.

---

## 🎯 Supported Scan Targets & Vulnerabilities

| Category | Endpoint / Parameter | Testing Tool |
|---|---|---|
| **SQL Injection** | `http://localhost:3003/?id=1` | `sqlmap` |
| **Reflected XSS** | `http://localhost:3003/?q=<script>alert(1)</script>` | `dalfox`, `nuclei` |
| **Stored XSS** | Post to Guestbook `/guestbook` | `dalfox`, `nuclei` |
| **Command Injection** | `POST http://localhost:3003/api/ping` with parameter `host=127.0.0.1;id` | `commix`, `nuclei` |
| **LFI / Path Traversal** | `http://localhost:3003/api/view-file?file=../../package.json` | `nuclei`, `dirsearch` |
| **GraphQL Introspection** | `http://localhost:3003/graphql` | `graphql_cop` |
| **JWT Weak Secrets** | `http://localhost:3003/api/jwt-auth?token=[jwt]` | `jwt_tool` |
| **SSTI (Template Injection)** | `http://localhost:3003/api/render?template=\${process.mainModule.require('child_process').execSync('id')}` | `nuclei` |
| **Open Redirect** | `http://localhost:3003/redirect?url=https://evil.com` | `nuclei` |
| **CORS Misconfiguration** | Reflects origin and sets `Access-Control-Allow-Credentials: true` | `corscanner` |
| **Exposed Secrets** | `/.env` and `/.git/config` | `trufflehog`, `git_dumper` |
| **Robots.txt Exposure** | `/robots.txt` | `nikto`, `gobuster` |
| **Security.txt Exposure** | `/.well-known/security.txt` | `nikto` |
