// Opt-in integration test: real Chrome/native recognition service with public
// synthetic course audio as a MediaStreamTrack. Never uses the user's microphone
// or Chrome profile. Results are real browser events, not mocked transcripts.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dailyLessons } from '../src/dailyCourse.ts';
import { createDailyProgress, createDailySession, beginDailyExercises, createDailyDraft, updateDailyDraft, submitDailyAnswer, advanceDailySession, parseDailyProgress } from '../src/dailyProgress.ts';
import { installNativeSpeechInput, prepareNativeSpeechInput } from './helpers/native-speech-input.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'CODEWORDS_TEST_URL must identify the running fixed-port server.');
const output = path.resolve(process.env.CODEWORDS_SPEECH_ARTIFACTS || 'artifacts/daily-speech');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
const problems = [];
const report = { at: new Date().toISOString(), browser: await browser.version(), input: 'Synthetic existing course MP3 -> Web Audio -> native SpeechRecognition.start(audioTrack). No physical microphone, user profile, or result mocking.', results: [], evidence: [], screenshots: [] };
const legacy = { 'codewords-mastered': '[1,2,3]', 'codewords-favorites': '[17]', 'codewords-review-v1': '{"speech-native-test-sentinel":true}' };

function beforeSpeaking(lessonId) {
  const lesson = dailyLessons.find(item => item.id === lessonId);
  let progress = createDailyProgress();
  progress.session = beginDailyExercises(createDailySession(lesson));
  for (const task of lesson.exercises) {
    if (task.kind === 'speak') break;
    const draft = createDailyDraft(task);
    if (['choice', 'listen'].includes(task.kind)) draft.choice = task.answers[0];
    if (task.kind === 'fill') draft.blanks = task.blanks.map(items => items[0]);
    if (task.kind === 'write') draft.text = task.answers[0];
    if (task.kind === 'order') {
      const used = new Set();
      draft.order = task.answers[0].split(' ').map(word => { const index = task.options.findIndex((item, i) => item === word && !used.has(i)); assert.ok(index >= 0); used.add(index); return index; });
    }
    progress.session = updateDailyDraft(progress.session, draft);
    progress = advanceDailySession(submitDailyAnswer(progress, lesson), lesson);
  }
  assert.equal(lesson.exercises[progress.session.index].kind, 'speak');
  assert.equal(parseDailyProgress(JSON.stringify(progress), dailyLessons).writable, true);
  return progress;
}

async function open(progress) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => problems.push(error.message));
  await installNativeSpeechInput(page);
  await page.addInitScript(({ progress, legacy }) => {
    if (sessionStorage.getItem('native-speech-seeded')) return;
    for (const [key, value] of Object.entries(legacy)) localStorage.setItem(key, value);
    localStorage.setItem('codewords-section', 'daily');
    localStorage.setItem('codewords-theme', 'minimal');
    localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
    sessionStorage.setItem('native-speech-seeded', '1');
  }, { progress, legacy });
  await page.goto(baseURL);
  await page.locator('.daily-speaking').waitFor();
  return { context, page };
}

async function saved(page) { return page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1'))); }
async function evidence(page, label) {
  const events = await page.evaluate(() => window.__nativeSpeechEvidence);
  report.evidence.push({ label, events });
  assert.ok(events.some(attempt => attempt.events.some(event => event.type === 'result' && event.results.some(result => result.final))), `${label}: native final result exists`);
  assert.equal(events.some(attempt => attempt.events.some(event => event.type === 'error')), false, `${label}: no native recognition error`);
}
async function screenshot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `No horizontal overflow: ${name}`);
  await page.screenshot({ path: path.join(output, name), fullPage: true, animations: 'disabled' });
  report.screenshots.push(name);
}
async function read(page, id, target = id) {
  await prepareNativeSpeechInput(page, id);
  await page.locator(`[data-speech-target="${target}"]`).click();
  await page.waitForFunction(({ target }) => {
    const progress = JSON.parse(localStorage.getItem('codewords-daily-v1'));
    const text = target === 'self' ? progress.session.draft.text : progress.session.draft.speech?.transcripts[target];
    return !!text && !document.querySelector('.speech-live');
  }, { target }, { timeout: 18000 });
  assert.equal(await page.locator('.speech-error').count(), 0);
  if (target !== 'self') await page.locator(`[data-phrase-id="${target}"].matched`).waitFor();
}
async function legacyUnchanged(page) {
  assert.deepEqual(await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), Object.keys(legacy)), legacy);
}

try {
  const first = await open(beforeSpeaking('A1-01-01'));
  try {
    const { page } = first;
    await screenshot(page, 'before-read-1440.png');
    await read(page, 'hello');
    assert.equal(await page.locator('[data-phrase-id="hello"] .speech-word.matched').count(), 1);
    const hello = (await saved(page)).session.draft.speech.transcripts.hello;
    await evidence(page, 'first lesson hello');
    await page.reload();
    await page.locator('[data-phrase-id="hello"].matched').waitFor();
    assert.equal((await saved(page)).session.draft.speech.transcripts.hello, hello);
    await read(page, 'goodbye');
    await evidence(page, 'first lesson goodbye after refresh');
    const completedDraft = (await saved(page)).session.draft;
    for (const width of [1440, 1920, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : width === 1920 ? 1080 : 1000 });
      for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
        await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
        assert.deepEqual((await saved(page)).session.draft, completedDraft, `${theme}: draft preserved`);
        assert.equal(await page.locator('.speech-target.matched').count(), 2);
        await screenshot(page, `read-${theme}-${width}.png`);
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByLabel('界面风格', { exact: true }).selectOption('minimal');
    await page.getByRole('button', { name: '完成跟读', exact: true }).click();
    await page.locator('.daily-feedback').waitFor();
    assert.equal((await saved(page)).session.feedback.outcome, 'self');
    await page.getByRole('button', { name: '继续', exact: true }).click();
    await page.getByRole('heading', { name: '这一课已完成', exact: true }).waitFor();
    assert.ok((await saved(page)).lessons['A1-01-01'].completedAt > 0);
    assert.equal((await saved(page)).lessons['A1-01-01'].skills.speaking.independentAnswers, 0);
    assert.equal((await saved(page)).lessons['A1-01-01'].skills.speaking.selfReports, 1);
    await screenshot(page, 'read-complete-1440.png');
    await legacyUnchanged(page);
    report.results.push('First lesson: native hello/goodbye, word highlights, refresh, four themes and three widths, completion recorded as speaking self-report, legacy state intact.');
    console.log('PASS native first lesson, persistence, themes and completion');
  } finally { await first.context.close(); }

  const long = await open(beforeSpeaking('A1-01-06'));
  try {
    const { page } = long;
    await read(page, 'meet-ben');
    assert.equal(await page.locator('[data-phrase-id="meet-ben"] .speech-word.matched').count(), 8);
    await evidence(page, 'long sentence meet-ben');
    await screenshot(page, 'long-read-1440.png');
    await page.getByRole('button', { name: '自己表达', exact: true }).click();
    await read(page, 'meet-mia', 'self');
    const spoken = await page.locator('#daily-written-answer').inputValue();
    assert.match(spoken, /mia/i);
    assert.equal(await page.locator('.speech-word.missing, .speech-word.substituted').count(), 0, 'Own name is not marked against the read-aloud sample.');
    assert.equal(await page.locator('.speech-target').count(), 0);
    await evidence(page, 'free expression with different name');
    await screenshot(page, 'self-expression-1440.png');
    await page.reload();
    await page.locator('#daily-written-answer').waitFor();
    assert.equal(await page.locator('#daily-written-answer').inputValue(), spoken);
    for (const checkbox of await page.locator('.daily-checks input[type="checkbox"]').all()) await checkbox.check();
    await page.getByRole('button', { name: '完成自查', exact: true }).click();
    await page.locator('.daily-feedback').waitFor();
    assert.equal((await saved(page)).session.feedback.outcome, 'self');
    await legacyUnchanged(page);
    report.results.push('Native long sentence and free expression: complete multi-segment transcript, different learner name not compared against reference, editable textarea and refresh preserve text, completion remains self-assessment.');
    console.log('PASS native long sentence and free expression');
  } finally { await long.context.close(); }
  assert.deepEqual(problems, [], 'No uncaught browser errors');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = { name: error.name, message: error.message, stack: error.stack };
  throw error;
} finally {
  report.browserErrors = problems;
  await writeFile(path.join(output, 'native-ui-results.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
