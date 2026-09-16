// Smoke-test the generated static app under a nested URL, with isolated records.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
assert.ok(process.env.CODEWORDS_TEST_URL);
const url = new URL('dist/index.html', process.env.CODEWORDS_TEST_URL).href;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('response', response => { if (response.status() >= 400 && !response.url().endsWith('/favicon.ico')) errors.push(`${response.status()} ${response.url()}`); });
await page.addInitScript(() => {
  const NativeAudio = window.Audio;
  window.__productionAudio = [];
  function TrackedAudio(...args) {
    const audio = new NativeAudio(...args);
    audio.addEventListener('playing', () => window.__productionAudio.push(audio.src));
    return audio;
  }
  TrackedAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(TrackedAudio, NativeAudio); window.Audio = TrackedAudio;
});
try {
  await page.goto(url);
  await page.getByRole('button', { name: '日常英语', exact: true }).click();
  await page.locator('#daily-content').waitFor({ state: 'visible' });
  assert.equal(await page.getByRole('tab').count(), 4);
  await page.locator('.daily-lesson-row').first().getByRole('button').click();
  await page.getByRole('button', { name: '朗读 Hello!', exact: true }).click();
  await page.waitForFunction(() => window.__productionAudio.some(src => src.includes('/dist/audio/daily/aria/hello.mp3')));
  await page.getByRole('button', { name: '开始练习', exact: true }).click();
  await page.getByRole('button', { name: 'Hello!', exact: true }).click();
  await page.locator('.daily-controls .primary').click();
  await page.locator('.daily-feedback.correct').waitFor();
  await page.reload();
  await page.locator('.daily-feedback.correct').waitFor();
  await page.getByRole('button', { name: '编程英语', exact: true }).click();
  await page.locator('.word-button').first().click();
  await page.waitForFunction(() => window.__productionAudio.some(src => /\/dist\/audio\/aria\/word-/.test(src)));
  assert.equal(await page.locator('.word-card').count(), 10);
  assert.deepEqual(errors, []);
  const output = path.resolve('artifacts/daily-english'); await mkdir(output, { recursive: true });
  await writeFile(path.join(output, 'production-results.json'), JSON.stringify({ url, staticAudio: await page.evaluate(() => window.__productionAudio), feedbackRestored: true, programmingPreserved: true, errors }, null, 2));
  console.log('PASS production app: nested static paths, first-use section switch, daily/programming real audio, saved feedback restoration.');
} finally { await context.close(); await browser.close(); }
