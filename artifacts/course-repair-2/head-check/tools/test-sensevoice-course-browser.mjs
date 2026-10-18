// Browser wiring test. The microphone emits a public WAV; the local API is stubbed.
// Actual model inference is checked separately in Python, never implied by this test.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { createDailyProgress, createDailySession } from '../src/dailyProgress.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const url = process.env.CODEWORDS_TEST_URL;
const realService = process.env.CODEWORDS_REAL_SENSEVOICE === '1';
assert.ok(url, 'Set CODEWORDS_TEST_URL to the running site.');
const lesson = adaptiveDailyLessons[0];
const task = lesson.exercises.find(item => item.kind === 'speak');
const now = Date.now(), ids = task.knowledgeIds;
const seed = {
  ...createDailyProgress(),
  learning: { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) },
  session: { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--no-proxy-server', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('.runtime/pronunciation/goodbye-recorder-test.wav')}`,
] });
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const requests = [], errors = [];
  if (!realService) await context.route('http://127.0.0.1:18768/api/course-*', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    requests.push({ endpoint, method: request.method() });
    const headers = { 'Access-Control-Allow-Origin': new URL(url).origin,
      'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Local-Token', 'Content-Type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (endpoint === '/api/course-session') return route.fulfill({ status: 200, headers, body: JSON.stringify({ ready: true, engine: 'sensevoice-asr-trial-v1', token: 'test-only-token' }) });
    assert.equal(endpoint, '/api/course-transcribe');
    assert.equal(request.headers()['x-local-token'], 'test-only-token');
    const body = request.postDataJSON();
    assert.equal(typeof body.audio, 'string');
    assert.equal('reference' in body, false, 'Expected answer is never sent to ASR');
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: 'recognized', transcript: 'goodbye', pronunciationGraded: false }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (realService) page.on('request', request => {
    if (!request.url().includes('127.0.0.1:18768/api/course-')) return;
    requests.push({ endpoint: new URL(request.url()).pathname, method: request.method() });
    if (request.method() === 'POST') assert.equal('reference' in request.postDataJSON(), false);
  });
  await page.addInitScript(progress => {
    if (sessionStorage.getItem('sensevoice-course-seeded')) return;
    localStorage.setItem('codewords-section', 'daily');
    localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
    sessionStorage.setItem('sensevoice-course-seeded', '1');
  }, seed);
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByText('使用本机 SenseVoiceSmall 识别', { exact: false }).waitFor();
  const mic = page.locator('[data-speech-target="goodbye"]');
  await mic.click();
  await page.getByText('正在听，请开口读', { exact: false }).waitFor();
  await page.waitForTimeout(2500);
  const responseWait = page.waitForResponse(response => response.url().endsWith('/api/course-transcribe') && response.request().method() === 'POST');
  const stoppedAt = Date.now();
  await mic.click();
  const response = await responseWait;
  const serviceResult = await response.json();
  await page.locator('[data-phrase-id="goodbye"].matched').waitFor();
  const stopToUiMs = Date.now() - stoppedAt;
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
  assert.equal(saved.session.draft.speech.transcripts.goodbye, 'goodbye');
  assert.equal(saved.session.answers.length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator('[data-phrase-id="goodbye"].matched').waitFor();
  assert.ok(requests.some(item => item.endpoint === '/api/course-session'));
  assert.ok(requests.some(item => item.endpoint === '/api/course-transcribe' && item.method === 'POST'));
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ browserMediaRecorder: true, localApiStubbed: !realService, transcriptSaved: 'goodbye', modelAndDecodeMs: serviceResult.elapsedMs, stopToUiMs, mobile390NoOverflow: true, refreshPreserved: true, noAutomaticMastery: true, errors }));
} finally { await browser.close(); }
