import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { phonemes, phonemeAudioPath } from '../src/phonemeInventory.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/phonemic-offline';
const phonemeAudioURL = (id, kind) => new URL(phonemeAudioPath(id, kind), baseURL).href;
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [], errors = [], audio = [], externalRequests = [];
const raw = '{"version":1,"favorites":["foundation-letters"],"unknown":"keep exactly"}';
async function open(width = 1440, theme = 'lagoon') {
  const context = await browser.newContext({ viewport: { width, height: 1050 }, reducedMotion: 'reduce' });
  // No external network is available in any scenario. The local app server is
  // reachable, as it is when the computer has no internet connection.
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === new URL(baseURL).origin) return route.continue();
    externalRequests.push(url.href); return route.abort();
  });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(({ theme, raw }) => {
    localStorage.setItem('codewords-section', 'foundation'); localStorage.setItem('codewords-theme', theme);
    localStorage.setItem('codewords-foundation-v1', raw);
    window.media = []; window.events = [];
    const original = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      if (!window.media.includes(this)) window.media.push(this);
      for (const event of ['playing', 'ended', 'error']) this.addEventListener(event, () => window.events.push({ event, url: this.src, rate: this.playbackRate }), { once: true });
      return original.apply(this, args);
    };
  }, { theme, raw });
  await page.goto(baseURL);
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '音标与发音', exact: true }).click();
  await page.locator('.phonemic-cell').first().waitFor();
  return { page, context };
}
async function scenario(name, fn) {
  try { await fn(); results.push(name); console.log(`PASS ${name}`); }
  catch (e) { failures.push({ name, error: e.stack }); console.error(`FAIL ${name}: ${e.message}`); }
}
async function played(page, button, url, rate) {
  await page.evaluate(() => { window.events = []; });
  await button.click();
  await page.waitForFunction(url => window.events.some(e => e.url === url && (e.event === 'ended' || e.event === 'error')), url, { timeout: 20000 });
  const events = await page.evaluate(() => window.events); audio.push(...events);
  assert.ok(events.some(e => e.event === 'playing' && e.url === url && e.rate === rate), JSON.stringify(events));
  assert.ok(events.some(e => e.event === 'ended' && e.url === url));
  assert.ok(!events.some(e => e.event === 'error'));
}
try {
  await scenario('complete grouped chart is the entry point; keyboard accessible; no progress changes', async () => {
    const { page, context } = await open();
    assert.equal(await page.locator('.phonemic-cell').count(), 44);
    for (const [group, count] of [['vowels', 12], ['diphthongs', 8], ['consonants', 24]]) assert.equal(await page.locator(`.phonemic-${group} .phonemic-cell`).count(), count);
    assert.equal(await page.locator('.phonemic-tutorials').getAttribute('open'), null);
    await page.getByRole('button', { name: '听 /f/ 单音', exact: true }).focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.phonemic-detail h3').textContent(), '/f/');
    await page.getByRole('combobox', { name: '界面配色' }).selectOption('pearl');
    assert.equal(await page.locator('.phonemic-detail h3').textContent(), '/f/');
    await page.getByRole('button', { name: '看 /f/ 与 /v/ 的详细讲解', exact: true }).click();
    await page.getByRole('heading', { name: '/f/ 和 /v/：嘴形相同，声音哪里不同', exact: true }).waitFor();
    assert.notEqual(await page.locator('.phonemic-tutorials').getAttribute('open'), null);
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-foundation-v1')), raw);
    await context.close();
  });
  await scenario('local Cambridge recordings play without external network at normal and slow speeds', async () => {
    const { page, context } = await open();
    for (const id of ['ee', 'ay', 'd', 'th', 'f', 'ure']) {
      const item = phonemes.find(p => p.id === id);
      await played(page, page.getByRole('button', { name: `听 /${item.ipa}/ 单音`, exact: true }), phonemeAudioURL(id, 'sound'), 1);
      await played(page, page.getByRole('button', { name: `英式朗读 ${item.word}`, exact: true }), phonemeAudioURL(id, 'word'), 1);
    }
    await played(page, page.getByRole('button', { name: '慢速听 /iː/ 单音', exact: true }), phonemeAudioURL('ee', 'sound'), .72);
    await played(page, page.getByRole('button', { name: '英式慢速朗读 sheep', exact: true }), phonemeAudioURL('ee', 'word'), .72);
    await played(page, page.getByRole('button', { name: '听 /ɪ/ 单音', exact: true }), phonemeAudioURL('ih', 'sound'), 1);
    await played(page, page.getByRole('button', { name: '慢速对比听 /iː/', exact: true }), phonemeAudioURL('ee', 'sound'), .72);
    assert.equal(await page.locator('.phonemic-detail h3').textContent(), '/ɪ/');
    await played(page, page.getByRole('button', { name: '对比听 /ɪ/', exact: true }), phonemeAudioURL('ih', 'sound'), 1);
    await context.close();
  });
  if (process.env.CODEWORDS_CHECK_ALL_PHONEMES === '1') await scenario('all 44 local single sounds and 44 British examples finish with external network blocked', async () => {
    const { page, context } = await open();
    for (const item of phonemes) {
      await played(page, page.getByRole('button', { name: `听 /${item.ipa}/ 单音`, exact: true }), phonemeAudioURL(item.id, 'sound'), 1);
      await played(page, page.getByRole('button', { name: `英式朗读 ${item.word}`, exact: true }), phonemeAudioURL(item.id, 'word'), 1);
      console.log(`AUDIO ${item.ipa} ${item.word}`);
    }
    await context.close();
  });
  await scenario('local asset failure is visible and retry recovers; leaving page stops audio', async () => {
    const { page, context } = await open();
    await page.route('**/audio/phonemes/uk/*.mp3', route => route.abort());
    await page.getByRole('button', { name: '听 /f/ 单音', exact: true }).click();
    await page.locator('.phonemic-error').waitFor();
    assert.ok((await page.locator('.phonemic-error').textContent()).includes('未能播放'));
    await page.unroute('**/audio/phonemes/uk/*.mp3');
    await played(page, page.getByRole('button', { name: '重试单音', exact: true }), phonemeAudioURL('f', 'sound'), 1);
    assert.equal(await page.locator('.phonemic-error').count(), 0);
    await page.getByRole('button', { name: '慢速听 /iː/ 单音', exact: true }).click();
    await page.waitForFunction(() => window.media.some(a => !a.paused));
    await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '基础概念与语法', exact: true }).click();
    assert.equal(await page.evaluate(() => window.media.filter(a => !a.paused).length), 0);
    await context.close();
  });
  for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) for (const width of [1440, 390, 320]) await scenario(`${theme} ${width}px: all cells and details fit`, async () => {
    const { page, context } = await open(width, theme);
    const report = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, outside: [...document.querySelectorAll('.phonemic-chart button')].filter(el => el.getBoundingClientRect().height).filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.textContent) }));
    assert.ok(report.width <= width + 1, JSON.stringify(report)); assert.deepEqual(report.outside, []);
    await page.screenshot({ path: `${output}/${theme}-${width}.png`, fullPage: true });
    if (width === 390) {
      await page.getByRole('button', { name: '听 /f/ 单音', exact: true }).click();
      await page.waitForFunction(() => document.activeElement?.id === 'phonemic-detail');
      assert.ok(await page.locator('.phonemic-detail').evaluate(el => el.getBoundingClientRect().top >= 0));
      await page.getByRole('button', { name: '返回音标表', exact: true }).click();
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('aria-label')), '听 /f/ 单音');
    }
    await context.close();
  });
} finally {
  await browser.close(); await writeFile(`${output}/${process.env.CODEWORDS_CHECK_ALL_PHONEMES === '1' ? 'results-all-audio' : 'results'}.json`, JSON.stringify({ results, failures, errors, audio, externalRequests, networkPolicy: 'External network blocked; local app server allowed; fresh browser contexts, no preloaded audio cache.' }, null, 2));
}
if (failures.length || errors.length || externalRequests.length) process.exitCode = 1;
