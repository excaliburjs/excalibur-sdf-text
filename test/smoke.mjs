// Boots an engine with the built plugin in headless Chromium, draws SDF text, and checks pixels landed.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mime = { '.js': 'text/javascript', '.html': 'text/html', '.map': 'application/json', '.ttf': 'font/ttf', '.png': 'image/png', '.json': 'application/json' };
const page = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{"excalibur":"/node_modules/excalibur/build/esm/excalibur.min.js"}}</script>
<style>body{margin:0;background:#000}</style></head><body>
<script type="module">
import { Engine, Actor, Loader, Color, vec } from 'excalibur';
import { SDFFont, SDFText, SDFTextPlugin } from '/dist/excalibur-sdf-text.js';
const font = new SDFFont({ fontFamily: 'sans-serif', fontSize: 48, color: Color.White });
const game = new Engine({ width: 400, height: 200, plugins: [new SDFTextPlugin()], suppressPlayButton: true });
await game.start(new Loader([font]));
const text = new SDFText({ sdf: font, text: 'Hello SDF', size: 64 });
game.add(new Actor({ pos: vec(20, 60), anchor: vec(0, 0), graphic: text }));
window.__text = text;
window.__ready = true;
</script></body></html>`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page);
  }
  const file = path.join(root, url.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': mime[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, resolve));
const port = server.address().port;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
const tab = await browser.newPage();
await tab.addInitScript(() => {
  window.__drawCalls = 0;
  const drawElements = WebGL2RenderingContext.prototype.drawElements;
  WebGL2RenderingContext.prototype.drawElements = function (...args) {
    window.__drawCalls++;
    return drawElements.apply(this, args);
  };
});
const errors = [];
tab.on('pageerror', (e) => errors.push(e.message));
tab.on('console', (m) => (m.type() === 'error' ? errors.push(m.text()) : null));
try {
  await tab.goto(`http://localhost:${port}/`);
  await tab.waitForFunction(() => window.__ready, null, { timeout: 30000 });
  await tab.waitForTimeout(500);
  const result = await tab.evaluate(() => {
    const text = window.__text;
    return { drawCalls: window.__drawCalls, width: text.width, height: text.height };
  });
  if (errors.length) {
    throw new Error('page errors:\n' + errors.join('\n'));
  }
  if (!(result.drawCalls > 0)) {
    throw new Error('the SDF renderer never issued a draw call');
  }
  if (!(result.width > 100 && result.height > 40)) {
    throw new Error(`unexpected text bounds ${result.width}x${result.height}`);
  }
  console.log(`ok: ${result.drawCalls} draw calls, text bounds ${result.width.toFixed(0)}x${result.height.toFixed(0)}`);
} finally {
  await browser.close();
  server.close();
}
