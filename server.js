// Thundersales Beller Records — Node.js server (geen dependencies nodig)
// Start:  node server.js
// Config via environment variables (zie README.md).
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const BASE = ('/' + (process.env.BASE_PATH ?? 'leaderboard').replace(/^\/+|\/+$/g, '') + '/').replace(/\/+/g, '/');
const BELLER_USER = process.env.BELLER_USER || 'bellers';
const BELLER_PASS = process.env.BELLER_PASS || 'verander-dit-wachtwoord';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'verander-dit-admin-wachtwoord';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const SESSION_DAYS = Number(process.env.SESSION_DAYS) || 30;
const DATA_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'data.json');
// urenWeek = actuele stand deze week; salesTotaal (aantal) en urenTotaal = all-time totalen
const FIELDS = ['salesDag', 'salesWeek', 'salesMaand', 'urenWeek', 'salesTotaal', 'urenTotaal'];

const STATIC = {
  'index.html': 'text/html; charset=utf-8',
  'assets/style.css': 'text/css; charset=utf-8',
  'assets/app.js': 'text/javascript; charset=utf-8',
};

function seed() {
  const b = (id, name, salesDag, salesWeek, salesMaand, urenWeek, salesTotaal, urenTotaal) => ({ id, name, salesDag, salesWeek, salesMaand, urenWeek, salesTotaal, urenTotaal });
  return { updatedAt: new Date().toISOString(), bellers: [
    b('b1', 'Nora Bakker', 4, 11, 11, 21.5, 11, 21.5),
    b('b2', 'Yordal', 2, 4, 4, 18.42, 4, 18.42),
    b('b3', 'Liam', 1, 3, 3, 35.25, 3, 35.25),
    b('b4', 'Maite Huigens', 1, 2, 2, 33.5, 2, 33.5),
  ] };
}

function load() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); } catch { return seed(); }
}
function store(data) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

function clean(input) {
  const seen = new Set();
  return (Array.isArray(input) ? input.slice(0, 200) : []).flatMap((b) => {
    if (!b || typeof b !== 'object') return [];
    const name = String(b.name ?? '').replace(/<[^>]*>/g, '').trim().slice(0, 60);
    if (!name) return [];
    let id = String(b.id ?? '').replace(/[^a-zA-Z0-9_-]/g, '');
    if (!id || seen.has(id)) id = 'b' + crypto.randomBytes(4).toString('hex');
    seen.add(id);
    const row = { id, name };
    for (const f of FIELDS) {
      const n = Number(b[f]);
      row[f] = Number.isFinite(n) ? Math.max(0, Math.min(100000000, Math.round(n * 100) / 100)) : 0;
    }
    return [row];
  });
}

// --- sessies: ondertekende cookie ---
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('base64url');
const safeEq = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
function getRole(req) {
  const m = /(?:^|;\s*)tslb=([^;]+)/.exec(req.headers.cookie || '');
  if (!m) return null;
  const [role, exp, sig] = decodeURIComponent(m[1]).split('.');
  if (!role || !exp || !sig || !safeEq(sig, sign(`${role}.${exp}`)) || Date.now() > Number(exp)) return null;
  return role === 'admin' || role === 'beller' ? role : null;
}
function setSession(req, res, role) {
  const https = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
  // Via https: SameSite=None + Partitioned, zodat de login ook binnen Microsoft Teams (iframe) werkt
  const attrs = `Path=${BASE}; HttpOnly; ${https ? 'SameSite=None; Secure; Partitioned' : 'SameSite=Lax'}`;
  if (!role) return res.setHeader('Set-Cookie', `tslb=; Max-Age=0; ${attrs}`);
  const exp = Date.now() + SESSION_DAYS * 86400000;
  const val = `${role}.${exp}.${sign(`${role}.${exp}`)}`;
  res.setHeader('Set-Cookie', `tslb=${encodeURIComponent(val)}; Max-Age=${SESSION_DAYS * 86400}; ${attrs}`);
}

function json(res, data, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (c) => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function handleApi(req, res, action) {
  const role = getRole(req);
  const post = req.method === 'POST';
  switch (action) {
    case 'me': return json(res, { role });
    case 'login': {
      if (!post) return json(res, { error: 'Methode niet toegestaan' }, 405);
      const { user = '', pass = '' } = await readBody(req);
      const u = String(user).toLowerCase();
      let r = null;
      if (safeEq(u, ADMIN_USER.toLowerCase()) && safeEq(pass, ADMIN_PASS)) r = 'admin';
      else if (safeEq(u, BELLER_USER.toLowerCase()) && safeEq(pass, BELLER_PASS)) r = 'beller';
      if (!r) { await sleep(800); return json(res, { error: 'Onjuiste gegevens' }, 401); }
      setSession(req, res, r);
      return json(res, { role: r });
    }
    case 'logout': setSession(req, res, null); return json(res, { ok: true });
    case 'data':
      if (!role) return json(res, { error: 'Niet ingelogd' }, 401);
      {
        const data = load();
        // Uurloon is alleen voor beheerders: totale uren niet meesturen naar bellers
        if (role !== 'admin') data.bellers = data.bellers.map(({ urenTotaal, ...rest }) => rest);
        return json(res, data);
      }
    case 'save': {
      if (!post) return json(res, { error: 'Methode niet toegestaan' }, 405);
      if (role !== 'admin') return json(res, { error: 'Geen toegang' }, role ? 403 : 401);
      const body = await readBody(req);
      const data = { updatedAt: new Date().toISOString(), bellers: clean(body.bellers) };
      try { store(data); } catch { return json(res, { error: 'Kan niet opslaan' }, 500); }
      return json(res, data);
    }
    default: return json(res, { error: 'Onbekende actie' }, 404);
  }
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = url.pathname;

  if (p === BASE.slice(0, -1) && BASE !== '/') { res.writeHead(301, { Location: BASE + url.search }); return res.end(); }
  if (p === '/healthz') return json(res, { ok: true });
  if (!p.startsWith(BASE)) { res.writeHead(302, { Location: BASE }); return res.end(); }

  p = p.slice(BASE.length) || 'index.html';
  if (p === 'api.php') return handleApi(req, res, url.searchParams.get('action') || '');

  const type = STATIC[p];
  if (!type) { res.writeHead(404); return res.end('Niet gevonden'); }
  fs.readFile(path.join(__dirname, p), (err, buf) => {
    if (err) { res.writeHead(500); return res.end(); }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': p === 'index.html' ? 'no-cache' : 'public, max-age=300', 'X-Robots-Tag': 'noindex' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`Beller Records draait op http://localhost:${PORT}${BASE}`));
