// Exercises the exact bundled web paths/CSP in Chrome. Native speech/export callbacks
// are simulated here; this does not claim to test an Android device or recognizer.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { createDailyProgress, createDailySession } from '../src/dailyProgress.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dist = path.resolve('dist');
const origin = 'https://appassets.androidplatform.net';
const lesson = adaptiveDailyLessons[0], task = lesson.exercises.find(task => task.kind === 'speak');
const ids = task.knowledgeIds, now = Date.now();
const progress = { ...createDailyProgress(),
  learning: { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) },
  session: { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 360, height: 780 }, isMobile: true, hasTouch: true });
const page = await context.newPage(); page.setDefaultTimeout(10000);
const errors = [], audio = [], results = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', event => { if (event.type() === 'error') errors.push(event.text()); });
await context.route(`${origin}/**`, async route => {
  const request = route.request(), pathname = new URL(request.url()).pathname;
  assert.ok(pathname.startsWith('/assets/web/'), request.url());
  const relative = decodeURIComponent(pathname.slice('/assets/web/'.length)), file = path.resolve(dist, relative);
  assert.ok(file.startsWith(dist + path.sep));
  const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const headers = { 'content-type': mime[path.extname(file)] || 'application/octet-stream' };
  if (relative === 'index.html') headers['content-security-policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; media-src 'self'; connect-src https://programming-english-learning-site.pages.dev/api/sync; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
  await route.fulfill({ status: 200, body: await readFile(file), headers });
});
await page.addInitScript(progress => {
  if (!sessionStorage.getItem('native-seeded')) {
    sessionStorage.setItem('native-seeded', '1');
    localStorage.setItem('codewords-section', 'daily');
    localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
    localStorage.setItem('codewords-favorites', '[1]');
  }
  window.__nativeMessages = []; window.__playing = [];
  window.CodeWordsNative = { onmessage: null, postMessage: text => window.__nativeMessages.push(JSON.parse(text)) };
  window.__emitNative = (event, text, code, id) => {
    id ||= window.__nativeMessages.findLast(message => message.action === 'speech-start').id;
    window.CodeWordsNative.onmessage({ data: JSON.stringify({ id, event, text, code }) });
  };
  const NativeAudio = window.Audio;
  window.Audio = function (...args) {
    const audio = new NativeAudio(...args);
    audio.addEventListener('playing', () => window.__playing.push({ src: audio.src, rate: audio.playbackRate }));
    return audio;
  };
  window.Audio.prototype = NativeAudio.prototype;
}, progress);
try {
  await page.goto(`${origin}/assets/web/index.html`);
  await page.locator('.daily-speaking').waitFor();
  await page.locator('.speech-service-note').filter({ hasText: '手机系统' }).waitFor();
  assert.deepEqual(await page.evaluate(() => window.__nativeMessages), []);
  const mic = page.locator('[data-speech-target="hello"]');
  await mic.click();
  await page.evaluate(() => { window.__emitNative('audio-start'); window.__emitNative('partial', 'Hel'); });
  assert.equal(await page.locator('[data-phrase-id="hello"].matched').count(), 0);
  await page.evaluate(() => { window.__emitNative('result', 'Hello.'); window.__emitNative('end'); });
  await page.locator('[data-phrase-id="hello"].matched').waitFor();
  results.push('bundled origin connects the native adapter; only a final result is saved');
  await mic.click();
  await page.evaluate(() => { window.__emitNative('error', '', 'not-allowed'); window.__emitNative('end'); });
  await page.getByRole('alert').filter({ hasText: '手机设置' }).waitFor();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')).session.answers.length), 0);
  results.push('native permission denial does not record a wrong answer');
  const target = page.locator('[data-phrase-id="hello"]');
  await target.getByRole('button', { name: /^听示范 / }).click();
  await page.waitForFunction(() => window.__playing.some(event => event.rate === 1));
  await target.getByRole('button', { name: /^慢速朗读 / }).click();
  await page.waitForFunction(() => window.__playing.some(event => event.rate === .72));
  audio.push(...await page.evaluate(() => window.__playing));
  assert.ok(audio.every(event => event.src.startsWith(`${origin}/assets/web/audio/`)));
  results.push('actual MP3 playback works from bundled paths at 1x and 0.72x');
  for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
    await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await page.reload(); await page.locator('[data-phrase-id="hello"].matched').waitFor();
  await page.getByRole('button', { name: '编程英语', exact: true }).click();
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '收藏', exact: true }).click();
  await page.locator('.word-card').waitFor();
  const slow = await page.locator('.word-card .slow-button').first().boundingBox();
  assert.ok(slow.height >= 44 && slow.width >= 44, 'Bundled CSS must load and retain reachable touch targets');
  await page.getByRole('button', { name: '导出编程英语记录', exact: true }).click();
  const exported = await page.evaluate(() => window.__nativeMessages.findLast(message => message.action === 'export'));
  assert.equal(exported.filename, 'programming-english-record.json');
  assert.equal(JSON.parse(exported.content)['codewords-favorites'], '[1]');
  results.push('reload preserves speech draft and favorites; export forwards the exact saved record');
  await mkdir('artifacts/android', { recursive: true });
  await page.screenshot({ path: 'artifacts/android/bundled-mobile-favorites.png', fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile('artifacts/android/web-bundle-results.json', JSON.stringify({ results, audio, errors, note: 'Chrome, exact bundled web paths and CSP; simulated native speech/export, not device validation.' }, null, 2));
  console.log(`PASS ${results.length} Android web-bundle scenarios, ${audio.length} actual playing events.`);
} finally { await browser.close(); }
