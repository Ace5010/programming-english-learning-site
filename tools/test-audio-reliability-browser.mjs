// Real MP3 browser decoding; native device regression is recorded separately.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
const base = process.env.CODEWORDS_TEST_URL || 'http://127.0.0.1:5186';
async function open(voice, delayed = false) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  if (delayed) await context.route('**/audio/**/*.mp3*', async route => { await new Promise(resolve => setTimeout(resolve, 1200)); await route.continue(); });
  await page.addInitScript(voice => {
    localStorage.setItem('codewords-voice', voice);
    window.__audioAudit = { items: [], events: [] };
    const Original = window.Audio;
    window.Audio = function (...args) {
      const audio = new Original(...args); window.__audioAudit.items.push(audio);
      for (const type of ['playing', 'ended', 'pause', 'error']) audio.addEventListener(type, () => window.__audioAudit.events.push({ type, src: audio.src, rate: audio.playbackRate, time: performance.now(), position: audio.currentTime }));
      return audio;
    };
    window.Audio.prototype = Original.prototype;
  }, voice);
  await page.goto(base);
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.locator('.daily-phrase').first().waitFor();
  return { context, page };
}
try {
  for (const voice of ['aria', 'guy']) for (const word of ['repository', 'project', 'code', 'readme']) {
    const { context, page } = await open(voice);
    assert.equal(await page.evaluate(() => window.__audioAudit.events.filter(event => event.type === 'playing').length), 0);
    await page.getByRole('button', { name: `朗读 ${word}`, exact: true }).click();
    await page.waitForFunction(() => window.__audioAudit.events.some(event => event.type === 'ended'));
    const events = await page.evaluate(() => window.__audioAudit.events);
    assert.equal(events.filter(event => event.type === 'playing').length, 1);
    assert.ok(events.find(event => event.type === 'ended').position > .1);
    results.push({ scenario: 'first audio click in a fresh browser context', voice, word, completed: true });
    await context.close();
  }
  console.log('PASS 8 fresh-context first clicks');
  for (const voice of ['aria', 'guy']) {
    const { context, page } = await open(voice);
    const before = await page.evaluate(() => localStorage.getItem('codewords-programming-course-v1'));
    const cards = page.locator('.daily-phrase'); assert.equal(await cards.count(), 8);
    for (let index = 0; index < 8; index++) for (const slow of [false, true]) {
      const card = cards.nth(index), text = await card.locator('strong').textContent();
      const start = await page.evaluate(() => ({ index: window.__audioAudit.events.length, time: performance.now() }));
      await card.locator(slow ? '.daily-inline-slow' : '.daily-phrase-content').click();
      await page.waitForFunction(start => window.__audioAudit.events.slice(start).some(event => event.type === 'ended'), start.index);
      const events = await page.evaluate(start => window.__audioAudit.events.slice(start), start.index);
      const playing = events.find(event => event.type === 'playing'), ended = events.find(event => event.type === 'ended');
      assert.ok(playing && ended); assert.equal(playing.rate, slow ? .72 : 1); assert.ok(ended.position > .1);
      results.push({ voice, text, rate: playing.rate, completed: true });
    }
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-programming-course-v1')), before);
    await context.close();
    console.log(`PASS first lesson: ${voice}, 8 recordings at both speeds`);
  }
  const { context, page } = await open('guy', true);
  const button = page.locator('.daily-phrase-content').first();
  for (let i = 0; i < 3; i++) await button.click();
  await page.waitForFunction(() => window.__audioAudit.events.some(event => event.type === 'ended'));
  assert.equal(await page.evaluate(() => window.__audioAudit.events.filter(event => event.type === 'playing').length), 1);
  results.push({ scenario: '1.2-second loading delay plus 3 taps still completes once' });
  await button.click();
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '词汇库', exact: true }).click();
  assert.equal(await page.evaluate(() => window.__audioAudit.items.every(item => item.paused)), true);
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '课程', exact: true }).click();
  const count = await page.evaluate(() => window.__audioAudit.events.length);
  await page.locator('.daily-phrase-content').first().click();
  await page.waitForFunction(count => window.__audioAudit.events.slice(count).some(event => event.type === 'ended'), count);
  results.push({ scenario: 'navigation stops playback; returning to the saved lesson can play again' });
  for (const [word, slow] of [['repository', false], ['project', false], ['repository', false], ['code', false], ['code', true], ['code', false], ['code', false]]) {
    const count = await page.evaluate(() => window.__audioAudit.events.length);
    const card = page.locator('.daily-phrase').filter({ has: page.getByRole('button', { name: `朗读 ${word}`, exact: true }) });
    await card.locator(slow ? '.daily-inline-slow' : '.daily-phrase-content').click();
    await page.waitForFunction(count => window.__audioAudit.events.slice(count).some(event => event.type === 'ended'), count);
    results.push({ scenario: 'returning to an earlier word and repeating normal/slow', word, rate: slow ? .72 : 1, completed: true });
  }
  await context.close(); assert.deepEqual(errors, []);
  await mkdir('artifacts/audio-reliability', { recursive: true });
  await writeFile('artifacts/audio-reliability/browser-results.json', JSON.stringify({ results, errors, note: 'Real MP3 browser playback; no claim of hearing the device speaker.' }, null, 2));
  console.log(`PASS ${results.length} reliability cases`);
} finally { await browser.close(); }
