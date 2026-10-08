// Offline renderer: drives headless Chrome over the DevTools protocol (no npm deps),
// steps the film frame by frame, and pipes PNG frames + the synthesized soundtrack into ffmpeg.
//
//   node render/render.mjs                         -> out/<name>.mp4 (full film; <name> = project folder)
//   node render/render.mjs --stills 3.2,10.5 --sheet s1 --cols 2 --still-scale 0.5
//                                                  -> PNG stills in out/stills/ (+ out/s1.png contact sheet)
//   node render/render.mjs --from 10 --to 14       -> partial render (out/preview.mp4)
//   node render/render.mjs --audio-only            -> out/<name>.wav
//   node render/render.mjs --reuse-audio           -> full film reusing out/<name>.wav (render audio first)
// Options: --name <n> --root <dir to serve> --fps 24 --crf 15 --chrome <path> --no-audio
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
let FPS = +opt('fps', 0); // 0 = use the film's own fps
const stills = opt('stills', null);
const from = opt('from', null);
const to = opt('to', null);
const audioOnly = opt('audio-only', false);
const noAudio = opt('no-audio', false);
const reuseAudio = opt('reuse-audio', false);
const stillScale = +opt('still-scale', 0.5);
import { homedir } from 'node:os';
import { readdirSync } from 'node:fs';
// Prefer Playwright's chrome-headless-shell (no auto-updater, which can kill long headless renders);
// fall back to an installed Chrome/Chromium. Override with --chrome <path> or CHROME_PATH.
function findChrome() {
  if (process.env.CHROME_PATH && existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const caches = [path.join(homedir(), 'Library/Caches/ms-playwright'), path.join(homedir(), '.cache/ms-playwright'), path.join(homedir(), 'AppData/Local/ms-playwright')];
  const shells = ['chrome-headless-shell-mac-arm64', 'chrome-headless-shell-mac-x64', 'chrome-headless-shell-linux64', 'chrome-headless-shell-win64'];
  for (const pw of caches) {
    let dirs = [];
    try { dirs = readdirSync(pw).filter(d => d.startsWith('chromium_headless_shell-')).sort().reverse(); } catch {}
    for (const d of dirs) for (const sh of shells) for (const bin of ['chrome-headless-shell', 'chrome-headless-shell.exe']) {
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
const NAME = opt('name', path.basename(projectDir));
const CRF = String(opt('crf', 15));
// Serve from the enclosing git repo (so shared assets like ../../refs resolve), else the project.
function findRoot() {
  if (opt('root', null)) return path.resolve(opt('root'));
  let d = projectDir;
  while (d !== path.dirname(d)) { if (existsSync(path.join(d, '.git'))) return d; d = path.dirname(d); }
  return projectDir;
}
const repoRoot = findRoot();
const pagePath = '/' + path.relative(repoRoot, path.join(projectDir, 'index.html')).split(path.sep).join('/');

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.png': 'image/png', '.json': 'application/json', '.css': 'text/css' };

function serve() {
  return new Promise(resolve => {
    const server = createServer(async (req, res) => {
      const p = path.join(repoRoot, decodeURIComponent(new URL(req.url, 'http://x').pathname));
      if (!p.startsWith(repoRoot)) { res.writeHead(403).end(); return; }
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
  const userDir = await mkdtemp(path.join(tmpdir(), 'film-render-chrome-'));
  const proc = spawn(chromePath, [
    ...(chromePath.includes('headless-shell') ? [] : ['--headless=new']), '--remote-debugging-port=0', `--user-data-dir=${userDir}`,
    '--disable-background-networking', '--disable-component-update', '--disable-sync', '--disable-default-apps',
    '--disable-features=Translate,OptimizationHints,MediaRouter', '--no-service-autorun', '--disable-crash-reporter',
    '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--mute-audio',
    '--force-device-scale-factor=1', '--window-size=1920,1080', '--autoplay-policy=no-user-gesture-required',
    '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', 'about:blank',
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsUrl = await new Promise((resolve, reject) => {
    let buf = '';
    proc.stderr.on('data', d => {
      buf += d;
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
      if (m) resolve(m[1]);
    });
    proc.on('exit', c => reject(new Error('chrome exited ' + c + '\n' + buf)));
  });
  // keep a tail of chrome's stderr for crash diagnosis
  let errTail = '';
  proc.stderr.on('data', d => { errTail = (errTail + d).slice(-4000); });
  proc.on('exit', (code, sig) => {
    console.error(`\nchrome exited (code ${code}, signal ${sig})\n` + errTail);
    process.exit(2);
  });
  return { proc, wsUrl, userDir };
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method) listeners.forEach(l => l(m));
  };
  const open = new Promise(r => (ws.onopen = r));
  const send = (method, params = {}, sessionId) => new Promise((res, rej) => {
    const i = ++id;
    pending.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params, sessionId }));
  });
  return { open, send, on: f => listeners.push(f), close: () => ws.close() };
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const server = await serve();
  const port = server.address().port;
  const chrome = await launchChrome();
  const c = cdp(chrome.wsUrl);
  await c.open;
  const { targetId } = await c.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await c.send('Target.attachToTarget', { targetId, flatten: true });
  const S = (m, p) => c.send(m, p, sessionId);
  c.on(m => {
    if (m.method === 'Runtime.consoleAPICalled' && m.sessionId === sessionId)
      console.log('[page]', m.params.args.map(a => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console.error('[page error]', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  });
  await S('Runtime.enable');
  await S('Page.enable');
  await S('Page.navigate', { url: `http://127.0.0.1:${port}${pagePath}?render=1` });
  const evaluate = async expr => {
    const r = await S('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  // wait for the film API
  for (let i = 0; i < 200; i++) {
    const ok = await evaluate('!!(window.FILM && window.FILM.ready)').catch(() => false);
    if (ok) break;
    await new Promise(r => setTimeout(r, 100));
  }
  await evaluate('window.FILM.ready');
  const info = await evaluate('window.FILM.info()');
  console.log('film:', info);
  if (!FPS) FPS = info.fps;

  const cleanup = async () => {
    c.close(); chrome.proc.removeAllListeners('exit'); chrome.proc.kill('SIGKILL'); server.close();
    await rm(chrome.userDir, { recursive: true, force: true }).catch(() => {});
  };

  try {
    if (stills) {
      const dir = path.join(outDir, 'stills');
      await rm(dir, { recursive: true, force: true });
      await mkdir(dir, { recursive: true });
      const files = [];
      for (const s of String(stills).split(',')) {
        const t = +s;
        const url = await evaluate(`window.FILM.frame(${t}, ${stillScale})`);
        const f = path.join(dir, `t${t.toFixed(3).padStart(7, '0')}.png`);
        await writeFile(f, Buffer.from(url.split(',')[1], 'base64'));
        files.push(f);
      }
      const sheet = opt('sheet', null);
      if (sheet) {
        const cols = +opt('cols', 2), rows = Math.ceil(files.length / cols);
        const outF = path.join(outDir, sheet + '.png');
        await new Promise(r => spawn('ffmpeg', ['-y', '-loglevel', 'error', '-pattern_type', 'glob', '-i', path.join(dir, '*.png'),
          '-vf', `tile=${cols}x${rows}:padding=6:color=white`, '-frames:v', '1', outF], { stdio: 'inherit' }).on('exit', r));
        console.log(outF);
      } else files.forEach(f => console.log(f));
      return;
    }

    const wavPath = path.join(outDir, from !== null && !reuseAudio ? 'preview.wav' : `${NAME}.wav`);
    if (!noAudio && !(reuseAudio && existsSync(wavPath))) {
      const t0 = Date.now();
      const b64 = await evaluate('window.FILM.audioWav()');
      await writeFile(wavPath, Buffer.from(b64, 'base64'));
      console.log('audio rendered in', ((Date.now() - t0) / 1000).toFixed(1) + 's ->', wavPath);
    }
    if (audioOnly) return;

    const start = from !== null ? +from : 0;
    const end = to !== null ? +to : info.duration;
    const n = Math.round((end - start) * FPS);
    const outFile = path.join(outDir, from !== null ? 'preview.mp4' : `${NAME}.mp4`);
    const ff = spawn('ffmpeg', [
      '-y', '-loglevel', 'error', '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
      ...(noAudio ? [] : ['-ss', String(start), '-t', String(end - start), '-i', wavPath]),
      '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-tune', 'animation',
      '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
      ...(noAudio ? [] : ['-af', 'alimiter=limit=0.89:attack=2:release=60:level=disabled', '-c:a', 'aac', '-b:a', '320k', '-ar', '48000']),
      '-movflags', '+faststart', '-shortest', outFile,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    const t0 = Date.now();
    for (let i = 0; i < n; i++) {
      const t = start + i / FPS;
      const url = await evaluate(`window.FILM.frame(${t}, 1)`);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      if (i % 24 === 0) process.stdout.write(`\rframe ${i}/${n}  ${(i / ((Date.now() - t0) / 1000 + 1e-9)).toFixed(1)} fps   `);
    }
    ff.stdin.end();
    await new Promise(r => ff.on('exit', r));
    console.log('\nwrote', outFile);
    // cue sheet for scripts/review.py --cues
    try {
      const tl = await import(pathToFileURL(path.join(projectDir, 'src', 'timeline.js')).href);
      if (tl.C) await writeFile(path.join(outDir, 'cues.json'), JSON.stringify(tl.C, null, 1));
    } catch {}
  } finally {
    await cleanup();
  }
}

main().catch(e => { console.error(e); process.exit(1); });
