import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const baseURL = 'http://127.0.0.1:5186/';
const results = [], errors = [], audio = [];
try {
  for (const [width, theme] of [[1440, 'lagoon'], [390, 'lagoon'], ...['lagoon', 'pearl', 'sky', 'mint'].map(theme => [320, theme])]) {
    const context = await browser.newContext({ viewport: { width, height: 1120 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/*', route => new URL(route.request().url()).origin === new URL(baseURL).origin ? route.continue() : route.abort());
    await page.addInitScript(theme => {
      localStorage.setItem('codewords-section', 'foundation');
      localStorage.setItem('codewords-theme', theme);
      localStorage.setItem('codewords-foundation-v1', '{"version":1,"unrecognized":"keep exactly"}');
      window.conceptAudio = [];
      const original = HTMLMediaElement.prototype.play;
      const observed = new WeakSet();
      HTMLMediaElement.prototype.play = function (...args) {
        if (!observed.has(this)) {
          observed.add(this);
          for (const event of ['playing', 'ended', 'error']) this.addEventListener(event, () => window.conceptAudio.push({ event, src: this.src, rate: this.playbackRate, preservesPitch: this.preservesPitch }));
        }
        return original.apply(this, args);
      };
    }, theme);
    await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
    await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '音标与发音', exact: true }).click();
    const before = await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !['codewords-theme', 'codewords-voice', 'codewords-playback-speed'].includes(key))));
    await page.locator('.phonemic-intro').getByRole('button', { name: '认识元音、辅音和音节', exact: true }).click();
    const article = page.locator('[data-topic="foundation-sound-concepts"]');
    await article.getByRole('heading', { name: '认识元音、辅音和音节', exact: true }).waitFor();
    assert.deepEqual(await article.locator('h3').allTextContents(), ['元音', '辅音', '音节', '重音']);
    assert.equal(await article.locator('.foundation-ipa, .tutorial-try, .foundation-mouth, .tutorial-sound-parts').count(), 0);
    assert.equal(await page.locator('.tutorial-directory li button').first().textContent(), '认识元音、辅音和音节');
    const layout = await article.evaluate(element => ({ scroll: document.documentElement.scrollWidth, fontSizes: [...element.querySelectorAll('p')].filter(p => p.getBoundingClientRect().height).map(p => parseFloat(getComputedStyle(p).fontSize)), outside: [...element.querySelectorAll('button')].filter(button => button.getBoundingClientRect().height).some(button => button.getBoundingClientRect().right > innerWidth + 1) }));
    assert.ok(layout.scroll <= width + 1 && !layout.outside);
    assert.ok(layout.fontSizes.every(size => size >= 16));
    if (width === 1440) {
      for (const voice of ['aria', 'guy']) {
        await page.getByRole('button', { name: '选择声音', exact: true }).click();
        await page.getByRole('combobox', { name: '点读声音', exact: true }).selectOption(voice);
        await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
        for (const word of ['teacher', 'American', 'about']) for (const slow of [false, true]) {
          await page.evaluate(() => { window.conceptAudio = []; });
          await article.getByRole('button', { name: `${slow ? '慢速朗读' : '朗读'} ${word}`, exact: true }).click();
          await page.waitForFunction(() => window.conceptAudio.some(event => event.event === 'ended'));
          const events = await page.evaluate(() => window.conceptAudio);
          const playing = events.filter(event => event.event === 'playing');
          assert.equal(playing.length, 1);
          assert.ok(playing[0].src.includes(`/foundation/${voice}/`));
          assert.equal(playing[0].rate, slow ? .72 : 1);
          assert.equal(playing[0].preservesPitch, true);
          assert.ok(!events.some(event => event.event === 'error'));
          audio.push({ voice, word, slow, events });
        }
      }
    }
    assert.deepEqual(await page.evaluate(() => Object.fromEntries(Object.entries(localStorage).filter(([key]) => !['codewords-theme', 'codewords-voice', 'codewords-playback-speed'].includes(key)))), before);
    await page.locator('.tutorial-reading').scrollIntoViewIfNeeded();
    if (width !== 320 || theme === 'lagoon') {
      await page.screenshot({ path: fileURLToPath(new URL(`preview-${width}.png`, import.meta.url)) });
      await article.screenshot({ path: fileURLToPath(new URL(`concepts-${width}.png`, import.meta.url)) });
    }
    results.push({ width, theme, layout, isolatedRecordsPreserved: true });
    await context.close();
  }
  assert.deepEqual(errors, []);
  await writeFile(new URL('smoke.json', import.meta.url), JSON.stringify({ results, audio, errors }, null, 2));
  console.log(JSON.stringify({ layouts: results.length, audioPlaybacks: audio.length, errors: errors.length }));
} finally { await browser.close(); }
