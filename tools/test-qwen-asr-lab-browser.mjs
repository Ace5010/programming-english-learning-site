// Public prerecorded speech -> real Chrome MediaRecorder -> actual local Qwen.
// This verifies the recording pipeline, not the user's voice or pronunciation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT ||
  'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const origin = process.env.CODEWORDS_LAB_ORIGIN || 'http://127.0.0.1:18769';
const output = path.resolve('artifacts/asr-replacement-20261004');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--no-proxy-server', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('.runtime/pronunciation/qwen-name-recorder.wav')}`,
] });
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(origin);
  await page.getByRole('heading', { name: '本机跟读试用' }).waitFor();
  assert.match(await page.locator('main').innerText(), /Qwen3-ASR/);
  assert.match(await page.locator('main').innerText(), /不保存/);
  await page.locator('#target').selectOption("What's your name?");
  assert.equal(await page.locator('#meaning').innerText(), '你叫什么名字？');
  const sample = page.waitForResponse(response => response.url().includes('/audio/') && response.url().includes('name'));
  await page.locator('#reference').click();
  assert.equal((await sample).status(), 200);
  assert.equal(await page.locator('#sample').evaluate(audio => audio.playbackRate), 1);
  await page.locator('#slow').click();
  assert.equal(await page.locator('#sample').evaluate(audio => audio.playbackRate), 0.72);
  assert.equal(await page.locator('#sample').evaluate(audio => audio.preservesPitch), true);
  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  }
  const responseWait = page.waitForResponse(response => response.url().endsWith('/api/assess'), { timeout: 40000 });
  await page.locator('#record').click();
  await page.locator('#record').filter({ hasText: '结束录音' }).waitFor();
  assert.equal(await page.locator('#sample').evaluate(audio => audio.paused), true);
  await page.waitForTimeout(3400);
  await page.locator('#record').click();
  const response = await responseWait;
  const data = await response.json();
  assert.equal(response.status(), 200);
  assert.equal(data.version, 'qwen3-asr-trial-v1');
  assert.equal(data.status, 'recognized');
  assert.equal(data.matched, true);
  assert.equal(data.transcript.toLowerCase().replace(/[^a-z ]/g, '').trim(), 'whats your name');
  assert.equal(data.pronunciationGraded, false);
  assert.equal(data.rawAudioSaved, false);
  assert.equal(data.cloudCalls, 0);
  await page.locator('#result').getByRole('heading').waitFor();
  assert.match(await page.locator('#result').innerText(), /还不能据此判断发音是否合格/);
  assert.equal(await page.locator('#playback').isVisible(), true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(output, 'qwen-trial-390.png'), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 920 });
  await page.screenshot({ path: path.join(output, 'qwen-trial-1280.png'), fullPage: true });

  // The answer field is used only after transcription; a different spoken word
  // must remain different. Silence and unauthorized requests cannot pass.
  const wrongWord = (await readFile('public/audio/aria/word-2400.mp3')).toString('base64');
  const silence = (await readFile('.runtime/pronunciation/qwen-silence.wav')).toString('base64');
  const api = await page.evaluate(async ({ audio, silence }) => {
    const headers = { 'Content-Type': 'application/json', 'X-Local-Token': token };
    const wrong = await fetch('/api/assess', { method: 'POST', headers,
      body: JSON.stringify({ reference: 'Tree', audio }) });
    const invalid = await fetch('/api/assess', { method: 'POST', headers,
      body: JSON.stringify({ reference: 'Hello', audio: 'not-base64' }) });
    const quiet = await fetch('/api/assess', { method: 'POST', headers,
      body: JSON.stringify({ reference: 'Hello', audio: silence }) });
    const denied = await fetch('/api/assess', { method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Local-Token': 'invalid' }, body: '{}' });
    return { wrongStatus: wrong.status, wrong: await wrong.json(), invalid: invalid.status,
      quietStatus: quiet.status, quiet: await quiet.json(), denied: denied.status };
  }, { audio: wrongWord, silence });
  assert.equal(api.wrongStatus, 200);
  assert.equal(api.wrong.matched, false);
  assert.equal(api.wrong.transcript.toLowerCase().replace(/[^a-z]/g, ''), 'three');
  assert.equal(api.invalid, 422);
  assert.equal(api.quietStatus, 200);
  assert.equal(api.quiet.status, 'no-speech');
  assert.equal(api.quiet.transcript, '');
  assert.equal(api.denied, 403);
  assert.deepEqual(errors, []);
  const report = { actualUserMicrophone: false, publicAudioViaRealMediaRecorder: true,
    localApiStubbed: false, model: data.version, transcript: data.transcript,
    elapsedMs: data.elapsedMs, courseProgressWritten: false,
    rawAudioSaved: false, cloudCalls: 0, responsiveWidths: [320, 390, 1280],
    referenceDidNotOverrideSpokenWord: true, silenceRejected: true,
    invalidAudioRejected: true, authorizationChecked: true, errors };
  await writeFile(path.join(output, 'trial-browser.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
