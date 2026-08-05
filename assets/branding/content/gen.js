const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const ROOT = '/tmp/branding/content';
const FONTS = '/home/bessilie/developer-portfolio/assets/fonts';
const LOGOS = '/tmp/logos/brand';
const SHOTS = '/home/bessilie/developer-portfolio/assets/screenshots';
const PORT = 9401;
const CDP = 9351;
const CHROME_DIR = '/tmp/opencode/ch-brand';

try { execSync(`pkill -9 -f "user-data-dir=${CHROME_DIR}"`, { stdio: 'ignore' }); } catch (e) {}

const srv = http.createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && u === '/save') {
    let body = '';
    for await (const ch of req) body += ch;
    const { name, dataURL } = JSON.parse(body);
    let dest;
    if (name.startsWith('mark:')) dest = path.join(LOGOS, name.slice(5));
    else dest = path.join(ROOT, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(dataURL.split(',')[1], 'base64'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ bytes: fs.statSync(dest).size }));
    return;
  }
  let file, root;
  if (u.startsWith('/f/')) { file = u.slice(3); root = FONTS; }
  else if (u.startsWith('/l/')) { file = u.slice(3); root = LOGOS; }
  else if (u.startsWith('/s/')) { file = u.slice(3); root = SHOTS; }
  else if (u === '/gen.html' || u === '/') { file = 'gen.html'; root = ROOT; }
  else { res.writeHead(404); res.end(); return; }
  const p = path.join(root, file);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  const ext = path.extname(p);
  const types = { '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.html': 'text/html; charset=utf-8', '.js': 'application/javascript' };
  res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(fs.readFileSync(p));
});

srv.listen(PORT, async () => {
  const chrome = spawn('chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--user-data-dir=' + CHROME_DIR,
    '--remote-debugging-port=' + CDP,
    '--force-color-profile=srgb',
    `http://127.0.0.1:${PORT}/gen.html?v=${Date.now()}`
  ], { stdio: 'ignore' });
  await sleep(2000);
  let t;
  for (let i = 0; i < 20; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json();
      t = l.find(x => x.type === 'page');
      if (t) break;
    } catch (e) {}
    await sleep(400);
  }
  if (!t) { console.error('no page'); process.exit(1); }
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  await new Promise(r => { ws.onopen = r; });
  const send = (method, params = {}) => new Promise(r => {
    const mid = ++id;
    pending.set(mid, r);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
  await send('Runtime.enable');
  const t0 = Date.now();
  const r = await send('Runtime.evaluate', { expression: 'window.__genAll()', awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) {
    console.error('EXC:', JSON.stringify(r.result.exceptionDetails).slice(0, 800));
    process.exit(1);
  }
  const out = r.result.result.value;
  const entries = Object.entries(out).sort((a, b) => a[0].localeCompare(b[0]));
  console.log('files:', entries.length, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  for (const [name, bytes] of entries) console.log(String(bytes).padStart(8) + '  ' + name);
  ws.close();
  chrome.kill();
  srv.close();
  process.exit(0);
});
