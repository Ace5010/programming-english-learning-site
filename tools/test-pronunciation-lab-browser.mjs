import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.CODEWORDS_LAB_ORIGIN || 'http://127.0.0.1:18765';
const engine = process.env.CODEWORDS_LAB_ENGINE || 'openpronounce-feedback-v2';
const out = `artifacts/course-upgrade/pre-push/pronunciation${engine.startsWith('crottc-whisper-word-') ? `/${engine}-browser` : ''}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('.runtime/pronunciation/goodbye-recorder-test.wav')}`,
] });
const results = [], errors = [];
try {
  const context = await browser.newContext({ permissions: ['microphone'], viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${out}/local-feedback-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#record').click();
  await page.locator('#record').filter({ hasText: '结束录音' }).waitFor();
  await page.waitForTimeout(2700);
  const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/assess'));
  await page.locator('#record').click();
  const response = await responsePromise;
  const assessment = await response.json();
  await page.locator('#result h2').waitFor();
  assert.equal(assessment.version, engine);
  assert.equal(assessment.status, 'supported');
  assert.equal(await page.locator('#playback').isVisible(), true);
  await page.screenshot({ path: `${out}/local-feedback-goodbye.png`, fullPage: true });
  results.push({ test: 'public Goodbye through browser MediaRecorder and real local API', status: assessment.status, elapsedMs: assessment.elapsedMs });
  // Cancel while the permission Promise is pending; a late grant must be released.
  await page.evaluate(() => {
    window.realGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = () => new Promise(resolve => { window.releaseMic = resolve; });
  });
  await page.locator('#record').click();
  await page.locator('#cancel').click();
  await page.evaluate(async () => {
    window.lateStream = await window.realGetUserMedia({ audio: true });
    window.releaseMic(window.lateStream);
  });
  await page.waitForFunction(() => window.lateStream.getTracks().every(track => track.readyState === 'ended'));
  assert.match(await page.locator('#status').innerText(), /已取消/);
  results.push({ test: 'late microphone grant after cancellation closes tracks', passed: true });
  await page.evaluate(() => { navigator.mediaDevices.getUserMedia = window.realGetUserMedia; });
  await page.locator('#record').click();
  await page.locator('#record').filter({ hasText: '结束录音' }).waitFor();
  await page.locator('#cancel').click();
  assert.equal(await page.locator('#playback').isVisible(), false);
  assert.equal(await page.locator('#record').isEnabled(), true);
  assert.deepEqual(errors, []);
  results.push({ test: 'recording cancellation restores UI', passed: true });
  // Check the known low-confidence case's presentation separately from real inference.
  await page.locator('#target').selectOption('Three');
  await page.route('**/api/assess', route => route.fulfill({ json: {
    status: 'uncertain', reason: 'asr-low-confidence', transcript: '', rawTranscript: 'Three.',
    diagnostics: { unconfirmedPhones: [{ target: 'θ' }] }, elapsedMs: 3200,
  } }));
  await page.locator('#record').click();
  await page.locator('#record').filter({ hasText: '结束录音' }).waitFor();
  await page.waitForTimeout(300);
  await page.locator('#record').click();
  await page.getByText('文字模型的候选：Three.（把握不足，未作为判定依据）。', { exact: true }).waitFor();
  assert.match(await page.locator('#result').innerText(), /语音识别本身把握不足/);
  assert.equal(await page.getByText('本次读法得到支持', { exact: true }).count(), 0);
  await page.screenshot({ path: `${out}/low-confidence-candidate.png`, fullPage: true });
  assert.deepEqual(errors, []);
  results.push({ test: 'low-confidence candidate remains uncertain (mocked display only)', passed: true });
  await context.close();
  await writeFile(`${out}/local-feedback-browser.json`, JSON.stringify({ results, errors, actualUserMicrophoneTested: false }, null, 2));
  console.log(JSON.stringify(results));
} finally { await browser.close(); }
