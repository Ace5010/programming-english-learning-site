// Isolated production browser test. Every uncached MP3 has 900 ms server latency.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slowReadingQueue } from '../src/slowReading.ts';
import { openSettings, closeSettings } from './helpers/settings-browser.mjs';
import { observeAudioSources } from './helpers/audio-source-observer.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ts = require('typescript');
const dist = path.resolve('dist');
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/audio-latency-20261112/regression');
await mkdir(output, {recursive:true});
const headers = await readFile(path.join(dist, '_headers'), 'utf8');
assert.match(headers, /\/audio\/\*\s+Cache-Control: public, max-age=86400/);
const playerSource = await readFile('src/audioPlayback.ts', 'utf8');
const baselineSource = process.env.CODEWORDS_BASELINE_PLAYER ? await readFile(process.env.CODEWORDS_BASELINE_PLAYER, 'utf8') : undefined;
const compile = source => ts.transpileModule(source, {compilerOptions:{target:ts.ScriptTarget.ES2020,module:ts.ModuleKind.ESNext}}).outputText;
const network = [], results = [], errors = [];
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname;
    if (pathname === '/player.js' || pathname === '/before-player.js') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(compile(pathname === '/before-player.js' ? baselineSource : playerSource)); return;
    }
    if (pathname === '/harness') {
      res.setHeader('Content-Type', 'text/html');
      res.setHeader('Content-Security-Policy', headers.match(/Content-Security-Policy: (.*)/)[1]);
      res.end('<button id="play">Play</button>'); return;
    }
    const before = pathname.startsWith('/before/');
    const relative = decodeURIComponent(before ? pathname.slice(7) : pathname);
    const file = path.resolve(dist, `.${relative === '/' ? '/index.html' : relative}`);
    if (!file.startsWith(dist + path.sep)) { res.writeHead(403).end(); return; }
    const body = await readFile(file);
    const extension = path.extname(file);
    if (extension === '.html') res.setHeader('Content-Security-Policy', headers.match(/Content-Security-Policy: (.*)/)[1]);
    res.setHeader('Content-Type', {'.html':'text/html','.js':'text/javascript','.css':'text/css','.mp3':'audio/mpeg','.svg':'image/svg+xml','.json':'application/json'}[extension] || 'application/octet-stream');
    if (extension === '.mp3') {
      network.push({url:req.url,at:Date.now()});
      await new Promise(resolve => setTimeout(resolve, 900));
      res.setHeader('Cache-Control', before ? 'no-store' : 'public, max-age=86400');
      // Match the observed host: 200 even when the browser requests a Range.
    }
    res.setHeader('Content-Length', body.length); res.end(body);
  } catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});
async function instrument(page) {
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', async d => {errors.push(d.message());await d.dismiss();});
  await page.addInitScript(observeAudioSources);
  await page.addInitScript(() => {
    const Original = window.Audio;
    window.__audioLatency = {items:[], events:[]};
    window.Audio = function(...args) {
      const audio = new Original(...args), id = window.__audioLatency.items.length;
      window.__audioLatency.items.push(audio);
      for (const type of ['playing','ended','error']) audio.addEventListener(type, () => window.__audioLatency.events.push({type,id,url:window.__audioSource(audio.currentSrc || audio.src),at:performance.now(),position:audio.currentTime,rate:audio.playbackRate}));
      return audio;
    };
    window.Audio.prototype = Original.prototype; Object.setPrototypeOf(window.Audio, Original);
    document.addEventListener('click', () => {window.__audioLatency.clickedAt = performance.now();}, true);
  });
}
async function click(page, button, label, expectFast = true) {
  const start = await page.evaluate(() => window.__audioLatency.events.length);
  await button.click();
  await page.waitForFunction(start => window.__audioLatency.events.slice(start).some(e => e.type === 'playing'), start);
  const timing = await page.evaluate(start => {
    const first = window.__audioLatency.events.slice(start).find(e => e.type === 'playing');
    return {...first, ms:first.at-window.__audioLatency.clickedAt};
  }, start);
  results.push({scenario:label,...timing});
  if (expectFast) assert.ok(timing.ms < 300, `${label}: ${timing.ms} ms`);
  console.log(`${label}: ${timing.ms.toFixed(1)} ms`);
  return timing;
}
async function waitWarm(page, suffix) {
  await page.waitForFunction(suffix => window.__audioLatency.items.some(a => window.__audioSource(a.src).includes(suffix) && a.readyState >= 3 && !a.seeking), suffix);
}
async function snapshot(page) {
  return page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([key]) => /daily-v1|review-v1|course-v1|mastered|favorites/.test(key)))));
}
try {
  for (const before of baselineSource ? [true,false] : [false]) {
    const context = await browser.newContext();
    const page = await context.newPage(); await instrument(page); await page.goto(`${base}harness`);
    const clips = slowReadingQueue('student', 'aria', before ? `${base}before/` : base);
    await page.evaluate(async ({clips,before}) => {
      const {AudioPlayback} = await import(before ? '/before-player.js' : '/player.js');
      window.__failures = 0;
      window.__player = new AudioPlayback(() => {}, () => {window.__failures++;});
      window.__player.preloadQueue(clips);
      document.querySelector('#play').onclick = () => window.__player.playQueue(clips, 1, 'word');
    }, {clips,before});
    await waitWarm(page, new URL(clips[0].url).pathname);
    const networkBefore = network.length;
    const event = await click(page, page.locator('#play'), before ? 'baseline warmed slow word' : 'fixed warmed slow word', !before);
    if (!before) assert.ok(Math.abs(event.position * 1000 - clips[0].startMs) < 180, 'play the requested word, not the beginning of its pack');
    await page.waitForFunction(() => !window.__player.isBusy);
    const newRequests = network.length - networkBefore;
    results.at(-1).extraRequests = newRequests;
    if (before) {
      assert.equal(await page.evaluate(() => window.__failures), 1, 'reproduce the old unseekable pack failure');
      results.at(-1).expectedFailure = 'host returned 200 to Range; wrong position and watchdog timeout';
    }
    else {
      assert.equal(await page.evaluate(() => window.__failures), 0);
      assert.equal(newRequests, 0);
      await click(page, page.locator('#play'), 'fixed repeat slow word');
      await page.waitForFunction(() => !window.__player.isBusy);
      assert.equal(network.length, networkBefore);
    }
    await context.close();
  }
  const cold = await browser.newContext();
  const coldPage = await cold.newPage(); await instrument(coldPage); await coldPage.goto(`${base}harness`);
  const coldClips = slowReadingQueue('student', 'guy', base);
  await coldPage.evaluate(async clips => {
    const {AudioPlayback} = await import('/player.js');
    window.__failures = 0;
    window.__player = new AudioPlayback(() => {}, () => {window.__failures++;});
    document.querySelector('#play').onclick = () => window.__player.playQueue(clips, 1, 'cold');
  }, coldClips);
  const coldEvent = await click(coldPage, coldPage.locator('#play'), 'cold first click completes after download', false);
  assert.ok(Math.abs(coldEvent.position * 1000 - coldClips[0].startMs) < 180);
  await coldPage.waitForFunction(() => !window.__player.isBusy);
  assert.equal(await coldPage.evaluate(() => window.__failures), 0);
  await cold.close();
  for (const width of [390, 1440]) {
    const context = await browser.newContext({viewport:{width,height:width===390?844:1000},reducedMotion:'reduce'});
    const page = await context.newPage(); page.setDefaultTimeout(20000);
    await instrument(page); await page.goto(base);
    await page.locator('.course-word-main').first().waitFor();
    const progress = await snapshot(page);
    await waitWarm(page, '/aria/word-1.mp3');
    await click(page, page.locator('.course-word-main').first(), `${width} course normal`);
    await page.waitForFunction(() => window.__audioLatency.items.every(a => a.paused || a.ended));
    const clip = slowReadingQueue('repository','aria',base)[0];
    await waitWarm(page, new URL(clip.url).pathname);
    await click(page, page.locator('.course-word-pronunciation .daily-inline-slow').first(), `${width} course slow`);
    await page.waitForFunction(() => window.__audioLatency.items.every(a => a.paused || a.ended));
    assert.equal(await snapshot(page), progress);
    await page.getByRole('navigation',{name:'学习导航'}).getByRole('button',{name:'词汇库',exact:true}).click();
    const card = page.locator('#vocabulary-content .library-card').nth(15);
    await card.scrollIntoViewIfNeeded();
    const word = (await card.locator('.library-card-word strong').textContent()).trim();
    const {vocabulary} = await import('../src/vocabulary.ts');
    const id = vocabulary.find(item => item.word === word).id;
    await waitWarm(page, `/aria/word-${id}.mp3`);
    await click(page, card.locator('.library-card-word'), `${width} scrolled library normal`);
    await page.waitForFunction(() => window.__audioLatency.items.every(a => a.paused || a.ended));
    const settings = await openSettings(page, 'audio');
    await settings.getByLabel('点读声音',{exact:true}).selectOption('guy');
    await closeSettings(page);
    await card.scrollIntoViewIfNeeded();
    await waitWarm(page, `/guy/word-${id}.mp3`);
    const changed = await click(page, card.locator('.library-card-word'), `${width} changed voice`);
    assert.ok(changed.url.includes('/guy/'));
    await page.screenshot({path:path.join(output,`library-${width}.png`)});
    assert.equal(await snapshot(page), progress);
    await page.getByRole('button',{name:'日常英语',exact:true}).click();
    await page.getByRole('navigation',{name:'学习导航'}).getByRole('button',{name:'词汇库',exact:true}).click();
    const dailyCard = page.locator('#daily-content .library-card').nth(15);
    await dailyCard.scrollIntoViewIfNeeded();
    const dailyText = (await dailyCard.locator('.library-card-word strong').textContent()).trim();
    const {dailyPhrases} = await import('../src/dailyCourse.ts');
    const phrase = dailyPhrases.find(item => item.en === dailyText);
    await waitWarm(page, `/daily/guy/${phrase.id}.mp3`);
    const dailyProgress = await snapshot(page);
    await click(page, dailyCard.locator('.library-card-word'), `${width} scrolled daily normal`);
    await page.waitForFunction(() => window.__audioLatency.items.every(a => a.paused || a.ended));
    assert.equal(await snapshot(page), dailyProgress);
    await page.screenshot({path:path.join(output,`daily-${width}.png`)});
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(path.join(output,'results.json'),JSON.stringify({latencyMs:900,results,errors,network},null,2));
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
console.log(`${results.length} latency scenarios passed.`);
