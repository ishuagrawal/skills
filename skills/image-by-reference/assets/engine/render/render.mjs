// Offline renderer: drives headless Chrome over the DevTools protocol (no npm deps) and writes
// PNGs of the picture.
//
//   node render/render.mjs                          -> out/<name>.png (full size)
//   node render/render.mjs --scale 0.4              -> out/<name>@0.4.png (fast draft)
//   node render/render.mjs --crop 0.55,0.2,0.2,0.15 -> out/<name>-crop.png (x,y,w,h fractions, full res)
//   node render/render.mjs --view notan             -> out/<name>-notan.png (3-value study)
//   node render/render.mjs --variants 1,2,3,4 --scale 0.3 --sheet seeds
//                                                   -> one draft per seed + out/seeds.png contact sheet
// Options: --seed N  --out <file>  --name <n>  --root <dir to serve>  --chrome <path>
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, '..');
const outDir = path.join(projectDir, 'out');

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const scale = +opt('scale', 1);
const seedArg = opt('seed', null);
const crop = opt('crop', null);
const view = opt('view', 'color');
const variants = opt('variants', null);
const NAME = opt('name', path.basename(projectDir));

// Prefer Playwright's chrome-headless-shell (no auto-updater); fall back to an installed
// Chrome/Chromium. Override with --chrome <path> or CHROME_PATH.
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const caches = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright'), path.join(homedir(), 'AppData/Local/ms-playwright')];
  const shells = ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64', 'chrome-headless-shell-win64', 'chrome-linux'];
  for (const pw of caches.filter(Boolean)) {
    let dirs = [];
    try { dirs = readdirSync(pw).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse(); } catch {}
    for (const d of dirs) for (const sh of shells) for (const bin of ['chrome-headless-shell', 'chrome-headless-shell.exe', 'headless_shell']) {
      const p = path.join(pw, d, sh, bin);
      if (existsSync(p)) return p;
    }
  }
  const fallbacks = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
  ];
  return fallbacks.find(p => existsSync(p)) || 'google-chrome';
}
const chromePath = opt('chrome', findChrome());

// Serve from the enclosing git repo (so shared assets like ../refs resolve), else the project.
function findRoot() {
  if (opt('root', null)) return path.resolve(opt('root'));
  let d = projectDir;
  while (d !== path.dirname(d)) { if (existsSync(path.join(d, '.git'))) return d; d = path.dirname(d); }
  return projectDir;
}
const root = findRoot();
const pagePath = '/' + path.relative(root, path.join(projectDir, 'index.html')).split(path.sep).join('/');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.css': 'text/css', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf' };

function serve() {
  return new Promise(resolve => {
    const server = createServer(async (req, res) => {
      const p = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(root)) { res.writeHead(403).end(); return; }
      try {
        const body = await readFile(p);
        res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
        res.end(body);
      } catch { res.writeHead(404).end(); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

async function launchChrome() {
  const userDir = await mkdtemp(path.join(tmpdir(), 'picture-render-chrome-'));
  const proc = spawn(chromePath, [
    ...(/headless[-_]shell/.test(chromePath) ? [] : ['--headless=new']),
    // Chrome refuses to start as root (containers, CI) unless its sandbox is off.
    ...(process.getuid?.() === 0 ? ['--no-sandbox'] : []), '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps',
    '--disable-features=Translate,OptimizationHints,MediaRouter', '--no-service-autorun', '--disable-crash-reporter',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-device-scale-factor=1', '--window-size=1600,1200', '--js-flags=--max-old-space-size=8192',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', d => { buf += d; const m = buf.match(/DevTools listening on (ws:\/\/\S+)/); if (m) resolve(m[1]); });
    proc.on('exit', c => reject(new Error('chrome exited ' + c + '\n' + buf)));
  });
  let errTail = '';
  proc.stderr.on('data', d => { errTail = (errTail + d).slice(-4000); });
  proc.on('exit', (code, sig) => { console.error(`\nchrome exited (code ${code}, signal ${sig})\n` + errTail); process.exit(2); });
  return { proc, wsUrl, userDir };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map(), listeners = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) listeners.forEach(l => l(m));
  };
  const open = new Promise(r => (ws.onopen = r));
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id; pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  return { open, send, on: f => listeners.push(f), close: () => ws.close() };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await serve();
  const chrome = await launchChrome();
  const c = cdp(chrome.wsUrl);
  await c.open;
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => c.send(m, p, sessionId);
  c.on(m => {
    if (m.method === 'Runtime.consoleAPICalled' && m.sessionId === sessionId) console.log('[page]', m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console.error('[page error]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await S('Runtime.enable'); await S('Page.enable');
  await S('Page.navigate', { url: `http://127.0.0.1:${server.address().port}${pagePath}?render=1` });
  const evaluate = async expr => {
    const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  const cleanup = async () => {
    c.close(); chrome.proc.removeAllListeners('exit'); chrome.proc.kill('SIGKILL'); server.close();
    await rm(chrome.userDir, { recursive: true, force: true }).catch(() => {});
  };
  try {
    for (let i = 0; i < 200; i++) {
      if (await evaluate('!!(window.PICTURE && window.PICTURE.ready)').catch(() => false)) break;
      await new Promise(r => setTimeout(r, 100));
    }
    await evaluate('window.PICTURE.ready');
    const info = await evaluate('window.PICTURE.info()');
    console.log('picture:', info);
    const shoot = async (seed, file) => {
      const o = { scale, view, ...(seed !== null ? { seed: +seed } : {}), ...(crop ? { crop: String(crop).split(',').map(Number) } : {}) };
      const t0 = Date.now();
      const url = await evaluate(`window.PICTURE.render(${JSON.stringify(o)})`);
      await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${file}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
      return file;
    };
    const suffix = (scale !== 1 ? `@${scale}` : '') + (crop ? '-crop' : '') + (view !== 'color' ? `-${view}` : '');
    if (variants) {
      const files = [];
      for (const s of String(variants).split(',')) files.push(await shoot(s, path.join(outDir, `${NAME}-s${s}${suffix}.png`)));
      const sheet = opt('sheet', null);
      if (sheet && files.length === 1) console.log('one variant: no sheet needed');
      else if (sheet) {
        const cols = +opt('cols', Math.min(files.length, 4)), rows = Math.ceil(files.length / cols);
        const outF = path.join(outDir, sheet + '.png');
        await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap(f => ['-i', f]),
          '-filter_complex', `${files.map((_, i) => `[${i}]`).join('')}xstack=inputs=${files.length}:layout=${files.map((_, i) => `${(i % cols) ? Array.from({ length: i % cols }, () => 'w0').join('+') : '0'}_${Math.floor(i / cols) ? Array.from({ length: Math.floor(i / cols) }, () => 'h0').join('+') : '0'}`).join('|')}:fill=white`,
          '-frames:v', '1', outF], { stdio: 'inherit' }).on('exit', r));
        console.log(outF, `(${cols}x${rows})`);
      }
    } else {
      await shoot(seedArg, opt('out', null) ? path.resolve(opt('out')) : path.join(outDir, `${NAME}${suffix}.png`));
    }
  } finally {
    await cleanup();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
