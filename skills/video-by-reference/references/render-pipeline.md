# Rendering pipeline

`render/render.mjs` (in the template) serves the repo over a tiny local HTTP server, launches a
headless Chromium with the DevTools protocol, opens `index.html?render=1`, and calls
`window.FILM.frame(t)` for every frame, piping PNGs into ffmpeg. No npm dependencies (Node ≥ 22
has a built-in WebSocket).

## Commands

```bash
node render/render.mjs --stills 3.2,10.5,12 --sheet act1 --cols 2 --still-scale 0.5   # contact sheet
node render/render.mjs --audio-only                     # out/<name>.wav only
node render/render.mjs --reuse-audio                    # full film, reusing the wav
node render/render.mjs --from 20 --to 26 --reuse-audio  # partial preview (out/preview.mp4)
```

Output: H.264 High, yuv420p, `-preset slow -crf 15 -tune animation`, BT.709 tags, AAC 320 kbps
48 kHz, `+faststart`. CRF 14–16 is visually lossless for flat art; grain raises bitrate a lot
(a 100 s film ≈ 150–200 MB at CRF 15 with grain 0.03).

## Why it's built this way (failure modes we hit)

| Symptom | Cause | Fix (already in the template) |
| --- | --- | --- |
| Render freezes forever at frame ~24–200, Chrome process gone, exit code 0 | Google Chrome's auto-updater/background services shut the headless browser down ~30 s in | Prefer Playwright's `chrome-headless-shell` (auto-detected in `~/Library/Caches/ms-playwright` / `~/.cache/ms-playwright`); add `--disable-background-networking --disable-component-update --no-service-autorun ...` |
| Renderer hangs instead of failing | No handler for the browser exiting | `proc.on('exit')` prints Chrome's stderr tail and exits non-zero |
| Crash/instability on long renders | Audio synthesis + frame capture in one session (memory) | Render audio in a separate pass; `--reuse-audio` |
| Module scripts fail to load | `file://` blocks ES modules | Serve over HTTP (the renderer does; for preview use `npx serve`) |
| Built-in browser pane can't open the preview | The pane can't reach localhost servers the agent starts | Use stills/contact sheets for review; the user can preview locally |
| ffmpeg `drawtext` missing | Build without libfreetype | Contact sheets via the `tile` filter (no timestamps; order is known) |
| WebGL unavailable | Headless GPU blocklist | `--enable-unsafe-swiftshader --ignore-gpu-blocklist` |
| Fonts differ from preview | Fonts resolved at render time | Use system fonts or self-host; check with a still |

## Partial renders and stills

Stills are the main iteration loop: fast, exact and reviewable as images. Render 10–25 stills
per act at the moments that matter (title holds, impacts, payoffs, transitions) at scale 0.33–0.5
into one sheet, look at it, fix, repeat. Use full renders for pacing review.

## After rendering

```bash
python3 <skill>/scripts/review.py out/film.mp4 --fps 1 --out out/review
```

Produces timed contact sheets (one per 25 s at 1 fps), the audio report and a spectrogram. Clean
scratch files (stills, sheets, logs) out of the output folder before delivering; keep `out/` in
`.gitignore`.
