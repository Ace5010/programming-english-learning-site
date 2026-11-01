// Verify inline word controls remain usable inside the native library dialog.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
const { chromium } = createRequire(import.meta.url)(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/combined-review-20261101/library-inline';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
try {
  for (const width of [1440, 390]) for (const voice of ['aria', 'guy']) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(voice => {
      localStorage.setItem('codewords-section', 'daily');
      localStorage.setItem('codewords-voice', voice);
      window.inlineAudio = [];
      const Original = window.Audio;
      window.Audio = function (...args) {
        const audio = new Original(...args);
        audio.addEventListener('playing', () => window.inlineAudio.push({ src: audio.src, rate: audio.playbackRate, pitch: audio.preservesPitch }));
        return audio;
      };
      window.Audio.prototype = Original.prototype;
    }, voice);
    try {
      await page.goto(baseURL);
      await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '词汇库', exact: true }).click();
      await page.getByRole('combobox', { name: '词汇类型' }).selectOption('all');
      await page.getByRole('searchbox', { name: '查找词汇' }).fill('Hi!');
      const trigger = page.getByRole('button', { name: '查看 Hi! 详情', exact: true });
      await trigger.click();
      const dialog = page.getByRole('dialog', { name: 'Hi! 详情', exact: true });
      const before = await page.evaluate(() => localStorage.getItem('codewords-daily-v1'));
      await dialog.getByRole('button', { name: '朗读单词 Hello', exact: true }).click();
      await page.waitForFunction(() => window.inlineAudio.some(event => !event.src.includes('/slow/') && event.rate === 1));
      const popup = page.locator('.reading-popup');
      await popup.waitFor();
      const geometry = await popup.evaluate(element => {
        const box = element.getBoundingClientRect();
        return { inDialog: !!element.closest('dialog[open]'), reachable: element.contains(document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2)), box: box.toJSON() };
      });
      await popup.getByRole('button', { name: '慢速朗读单词 Hello', exact: true }).click();
      await page.waitForFunction(() => window.inlineAudio.some(event => event.src.includes('/slow/') && event.rate === 1 && event.pitch));
      assert.equal(geometry.inDialog, true);
      assert.equal(geometry.reachable, true);
      await page.screenshot({ path: `${output}/${width}-${voice}.png`, fullPage: true });
      await page.keyboard.press('Escape');
      assert.equal(await popup.count(), 0, 'first Escape closes only the word control');
      assert.equal(await dialog.isVisible(), true, 'library details remain open');
      await page.keyboard.press('Escape');
      assert.equal(await dialog.count(), 0);
      assert.equal(await trigger.evaluate(element => document.activeElement === element), true);
      assert.equal(await page.evaluate(() => document.body.style.overflow), '');
      assert.equal(await page.evaluate(() => localStorage.getItem('codewords-daily-v1')), before);
      results.push({ width, voice, passed: true, geometry, audio: await page.evaluate(() => window.inlineAudio) });
      console.log(`PASS ${width}px ${voice}: inline normal/slow, Escape, focus and unchanged records`);
    } catch (error) {
      results.push({ width, voice, passed: false, error: error.message });
      await page.screenshot({ path: `${output}/${width}-${voice}-failed.png`, fullPage: true });
      throw error;
    } finally { await context.close(); }
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ baseURL, results, errors }, null, 2));
}
