import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT ||
  'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.CODEWORDS_LAB_ORIGIN || 'http://127.0.0.1:18768';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('.runtime/pronunciation/goodbye-recorder-test.wav')}`,
] });
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  assert.match(await page.locator('main').innerText(), /只显示识别出的单词/);
  assert.equal(await page.locator('#meaning').innerText(), '再见');
  const sampleResponse = page.waitForResponse(response => response.url().endsWith('/audio/Goodbye.mp3'));
  await page.locator('#reference').click();
  assert.equal((await sampleResponse).status(), 200);
  assert.equal(await page.locator('#sample').evaluate(audio => audio.playbackRate), 1);
  await page.locator('#slow').click();
  assert.equal(await page.locator('#sample').evaluate(audio => audio.playbackRate), 0.72);
  assert.equal(await page.locator('#sample').evaluate(audio => audio.preservesPitch), true);
  await page.locator('#target').selectOption('Think');
  assert.equal(await page.locator('#meaning').innerText(), '想；认为');
  assert.equal(await page.locator('#reference').innerText(), 'Think');
  await page.locator('#target').selectOption('Goodbye');
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    if (width === 390) await page.screenshot({ path: '.runtime/pronunciation/sensevoice-learner-390.png', fullPage: true });
  }
  await page.locator('#record').click();
  await page.locator('#record').filter({ hasText: '结束录音' }).waitFor();
  await page.waitForTimeout(2700);
  const responsePromise = page.waitForResponse(response => response.url().endsWith('/api/assess'));
  await page.locator('#record').click();
  const response = await responsePromise;
  const data = await response.json();
  assert.equal(response.status(), 200);
  assert.equal(data.version, 'sensevoice-asr-trial-v1');
  assert.equal(data.status, 'recognized');
  assert.equal(data.matched, true);
  assert.equal(data.transcript.toLowerCase(), 'goodbye');
  assert.equal(data.pronunciationGraded, false);
  await page.getByText('识别到：goodbye').waitFor();
  assert.match(await page.locator('#result').innerText(), /还不能据此判断发音是否合格/);
  assert.equal(await page.locator('#playback').isVisible(), true);
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ actualBrowserMicrophone: false,
    publicAudioViaBrowserMediaRecorder: true, recognition: data.transcript,
    elapsedMs: data.elapsedMs, responsiveWidths: [320, 390, 1280], errors }));
} finally {
  await browser.close();
}
