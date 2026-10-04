// Public WAV -> Chrome MediaRecorder -> course draft. Use CODEWORDS_REAL_QWEN=1
// for actual model inference; default stubs delayed startup and slow processing.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession } from '../src/dailyProgress.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL;
const realService = process.env.CODEWORDS_REAL_QWEN === '1';
assert.ok(url, 'Set CODEWORDS_TEST_URL to the running site.');
const cases = realService ? [
  { section: 'daily', id: 'goodbye', wav: 'goodbye-recorder-test.wav', recordMs: 2500 },
  { section: 'daily', id: 'whats-your-name', wav: 'qwen-name-recorder.wav', recordMs: 3000 },
  { section: 'programming', id: 'example-7', wav: 'qwen-pull-recorder.wav', recordMs: 4000 },
] : [{ section: 'daily', id: 'goodbye', wav: 'goodbye-recorder-test.wav', recordMs: 2500 }];
const output = path.resolve('artifacts/asr-replacement-20261004');
await mkdir(output, { recursive: true });
const reports = [];
for (const fixture of cases) {
const lessons = fixture.section === 'daily' ? adaptiveDailyLessons : adaptiveProgrammingLessons;
const candidates = lesson => [...lesson.exercises, ...(lesson.practice ?? [])];
const lesson = lessons.find(item => candidates(item).some(task => task.kind === 'speak' && task.readAloud?.some(phrase => phrase.id === fixture.id) && (!task.speechActivity || task.speechActivity === 'repeat')));
assert.ok(lesson, `No authored speaking task for ${fixture.id}`);
const task = candidates(lesson).find(task => task.kind === 'speak' && task.readAloud?.some(phrase => phrase.id === fixture.id) && (!task.speechActivity || task.speechActivity === 'repeat'));
const storageKey = fixture.section === 'daily' ? 'codewords-daily-v1' : 'codewords-programming-course-v1';
const now = Date.now(), ids = task.knowledgeIds;
const seed = {
  ...createDailyProgress(),
  learning: { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) },
  session: { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [
  '--no-proxy-server', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
  `--use-file-for-fake-audio-capture=${path.resolve('.runtime/pronunciation', fixture.wav)}`,
] });
try {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const requests = [], errors = [];
  let sessionProbes = 0;
  if (!realService) await context.route('http://127.0.0.1:18768/api/course-*', async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname;
    requests.push({ endpoint, method: request.method() });
    const headers = { 'Access-Control-Allow-Origin': new URL(url).origin,
      'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Local-Token', 'Content-Type': 'application/json' };
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    if (endpoint === '/api/course-session') return route.fulfill({ status: 200, headers, body: JSON.stringify({ ready: ++sessionProbes > 2, engine: 'qwen3-asr-trial-v1', token: 'test-only-token' }) });
    assert.equal(endpoint, '/api/course-transcribe');
    assert.equal(request.headers()['x-local-token'], 'test-only-token');
    const body = request.postDataJSON();
    assert.equal(typeof body.audio, 'string');
    assert.equal('reference' in body, false, 'Expected answer is never sent to ASR');
    await new Promise(resolve => setTimeout(resolve, 9200));
    return route.fulfill({ status: 200, headers, body: JSON.stringify({ status: 'recognized', transcript: 'goodbye', pronunciationGraded: false }) });
  });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  if (realService) page.on('request', request => {
    if (!request.url().includes('127.0.0.1:18768/api/course-')) return;
    requests.push({ endpoint: new URL(request.url()).pathname, method: request.method() });
    if (request.method() === 'POST') assert.equal('reference' in request.postDataJSON(), false);
  });
  await page.addInitScript(({ progress, section, storageKey }) => {
    if (sessionStorage.getItem('qwen-course-seeded')) return;
    localStorage.setItem('codewords-section', section);
    localStorage.setItem(storageKey, JSON.stringify(progress));
    localStorage.setItem('codewords-favorites', '[4]');
    sessionStorage.setItem('qwen-course-seeded', '1');
  }, { progress: seed, section: fixture.section, storageKey });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.getByText('使用本机 Qwen3-ASR 识别', { exact: false }).waitFor();
  assert.equal(requests.some(request => request.method === 'POST'), false, 'No automatic recording');
  if (!realService) assert.ok(sessionProbes >= 3, 'A model becoming ready after page load is discovered');
  const mic = page.locator(`[data-speech-target="${fixture.id}"]`);
  await mic.click();
  await page.getByText('正在听，请开口读', { exact: false }).waitFor();
  await page.waitForTimeout(fixture.recordMs);
  const responseWait = page.waitForResponse(response => response.url().endsWith('/api/course-transcribe') && response.request().method() === 'POST');
  const stoppedAt = Date.now();
  await mic.click();
  const response = await responseWait;
  const serviceResult = await response.json();
  assert.equal(response.status(), 200);
  await page.locator(`[data-phrase-id="${fixture.id}"].matched`).waitFor();
  const stopToUiMs = Date.now() - stoppedAt;
  const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(saved.session.draft.speech.transcripts[fixture.id], serviceResult.transcript, 'Raw transcript is preserved');
  assert.equal(saved.session.draft.speech.sources[fixture.id], 'recognition');
  assert.equal(saved.session.draft.speech.attempts[fixture.id], 1);
  assert.equal(saved.session.answers.length, 0);
  assert.ok(Object.values(saved.learning.targets).every(target => !target.readyAt), 'No automatic review admission');
  assert.equal(await page.evaluate(() => localStorage.getItem('codewords-favorites')), '[4]');
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: path.join(output, `qwen-course-${fixture.id}-390.png`), fullPage: true });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.locator(`[data-phrase-id="${fixture.id}"].matched`).waitFor();
  const restored = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), storageKey);
  assert.equal(restored.session.draft.speech.transcripts[fixture.id], serviceResult.transcript);
  assert.ok(requests.some(item => item.endpoint === '/api/course-session'));
  assert.ok(requests.some(item => item.endpoint === '/api/course-transcribe' && item.method === 'POST'));
  assert.deepEqual(errors, []);
  const report = { section: fixture.section, phrase: fixture.id, browserMediaRecorder: true, localApiStubbed: !realService, transcriptSaved: serviceResult.transcript, modelAndDecodeMs: serviceResult.elapsedMs, stopToUiMs, delayedStartupDiscovered: !realService, mobile390NoOverflow: true, refreshPreserved: true, noAutomaticMastery: true, errors };
  if (!realService) assert.ok(stopToUiMs >= 9000, 'CPU results arriving after the old eight-second limit are retained');
  reports.push(report);
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
}
await writeFile(path.join(output, realService ? 'course-browser.json' : 'course-browser-stub.json'), JSON.stringify(reports, null, 2));
