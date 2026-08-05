const ROOT = '/tmp/branding/content';
const PORT = 9402;
const CDP = 9352;
const CHROME_DIR = '/tmp/opencode/ch-brand';
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');
const sleep = ms => new Promise(r => setTimeout(r, ms));

try { execSync(`pkill -9 -f "user-data-dir=${CHROME_DIR}"`, { stdio: 'ignore' }); } catch (e) {}

const srv = http.createServer(async (req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  if (req.method === 'POST' && u === '/save') {
    let body = '';
    for await (const ch of req) body += ch;
    const { name, dataURL } = JSON.parse(body);
    const dest = path.join(ROOT, name);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(dataURL.split(',')[1], 'base64'));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ bytes: fs.statSync(dest).size }));
    return;
  }
  if (u === '/preview.html' || u === '/') { res.setHeader('Content-Type', 'text/html'); res.end(fs.readFileSync(path.join(ROOT, 'preview.html'))); return; }
  const p = path.join(ROOT, u);
  if (fs.existsSync(p) && fs.statSync(p).isFile()) {
    const types = { '.png': 'image/png' };
    res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream');
    res.end(fs.readFileSync(p));
    return;
  }
  res.writeHead(404); res.end();
});

srv.listen(PORT, async () => {
  const chrome = spawn('chromium', [
    '--headless=new', '--no-sandbox', '--disable-gpu',
    '--user-data-dir=' + CHROME_DIR,
    '--remote-debugging-port=' + CDP,
    '--force-color-profile=srgb',
    `http://127.0.0.1:${PORT}/preview.html?v=${Date.now()}`
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
  const r = await send('Runtime.evaluate', { expression: 'window.__buildPreview()', awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) { console.error('EXC:', JSON.stringify(r.result.exceptionDetails).slice(0, 800)); process.exit(1); }
  console.log('preview-grid.png', r.result.result.value, 'in', ((Date.now() - t0) / 1000).toFixed(1) + 's');
  ws.close(); chrome.kill(); srv.close(); process.exit(0);
});