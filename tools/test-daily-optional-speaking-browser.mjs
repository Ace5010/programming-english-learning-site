// Isolated Chrome: real local sample audio, simulated microphone recognition.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { planAdaptiveSession, beginAdaptiveLearning } from '../src/adaptiveLearning.ts';
import { createDailyProgress, createDailyDraft, getDailyLessonProgress, parseDailyProgress } from '../src/dailyProgress.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://127.0.0.1:5186/dist/';
assert.match(url, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/daily-optional-speaking-20261018/browser');
await mkdir(output, { recursive: true });
const task = lessons[0].practice.find(item => item.speechActivity === 'repeat');
const otherRecords = { 'codewords-mastered': '[1,2,3]', 'codewords-favorites': '[4]', 'codewords-programming-course-v1': JSON.stringify(createDailyProgress()) };
const results = [], errors = [], layouts = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
function seed({ legacy = false, final = false } = {}) {
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, lessons, Date.now(), () => .371);
  progress = beginAdaptiveLearning(progress, lessons);
  progress.session.queue = [{ exerciseId: task.id, retry: false }];
  progress.session.draft = createDailyDraft(task);
  progress.favorites = ['hello', 'goodbye'];
  progress.lessons['A1-01-02'] = { ...getDailyLessonProgress(progress, 'A1-01-02'), completedAt: Date.now() - 86400000 };
  if (legacy) progress.session.draft = { ...progress.session.draft, text: 'My saved expression.', checks: task.checks.map(() => true), speech: { mode: 'self', transcripts: { self: 'My saved expression.' }, sources: { self: 'recognition' } } };
  if (final) progress.session.adaptive.budget = 1; // Synthetic final item, not a course rule.
  assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, true);
  return progress;
}
async function open(options = {}) {
  const original = seed(options);
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
  await context.route('http://127.0.0.1:18768/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ original, otherRecords, unsupported, phase }) => {
    if (!sessionStorage.getItem('optional-speaking-fixture')) {
      localStorage.setItem('codewords-section', 'daily');
      localStorage.setItem('codewords-daily-v1', JSON.stringify(original));
      Object.entries(otherRecords).forEach(([key, value]) => localStorage.setItem(key, value));
      sessionStorage.setItem('optional-speaking-fixture', '1');
    }
    window.__speechCalls = []; window.__playing = [];
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (...args) {
      this.addEventListener('playing', () => window.__playing.push({ src: this.currentSrc, rate: this.playbackRate, preservesPitch: this.preservesPitch }), { once: true });
      return nativePlay.apply(this, args);
    };
    class MockRecognition {
      processLocally = false;
      static available() { return Promise.resolve('downloadable'); }
      start() { window.__speechCalls.push(this); this.onstart?.(); if (phase !== 'starting') this.onaudiostart?.(); }
      stop() { this.stopped = true; if (phase !== 'processing') queueMicrotask(() => this.onend?.()); }
      abort() { this.aborted = true; }
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = unsupported ? undefined : MockRecognition;
    window.__emitSpeech = text => {
      const current = window.__speechCalls.at(-1);
      current.onresult?.({ results: [{ isFinal: true, 0: { transcript: text } }] });
      if (!current.stopped) current.onend?.();
    };
  }, { original, otherRecords, ...options });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.locator('#daily-content .daily-question').waitFor();
  return { context, page, original };
}
const record = page => page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
const primary = page => page.locator('#daily-content .daily-controls .primary');
const expand = page => page.locator('.daily-optional-speaking > summary').click();
const mic = page => page.locator(`[data-speech-target="${task.readAloud[0].id}"]`);
async function continueOnce(page) {
  await primary(page).click();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('codewords-daily-v1')).session.index === 1);
  return record(page);
}
async function scenario(name, run, options) {
  if (process.env.CODEWORDS_SCENARIO && !name.includes(process.env.CODEWORDS_SCENARIO)) return;
  const env = await open(options);
  try {
    await run(env);
    for (const [key, value] of Object.entries(otherRecords)) assert.equal(await env.page.evaluate(key => localStorage.getItem(key), key), value, key);
    results.push({ name, passed: true });
    console.log('PASS', name);
  } catch (error) {
    await env.page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true });
    throw error;
  } finally { await env.context.close(); }
}
async function checkLayout(page, label) {
  const layout = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth,
    font: getComputedStyle(document.querySelector('.daily-optional-speaking > summary')).fontSize,
    selfCheckControls: document.querySelectorAll('#daily-content .daily-checks input, #daily-content .speech-edit').length }));
  assert.ok(layout.width <= layout.viewport + 1, `${label}: horizontal overflow`);
  assert.ok(parseFloat(layout.font) >= 16);
  assert.equal(layout.selfCheckControls, 0);
  layouts.push({ label, ...layout });
  await page.screenshot({ path: path.join(output, `${label}.png`), fullPage: true });
}
try {
  await scenario('skip-without-microphone-or-self-check', async ({ page, original }) => {
    assert.equal(await page.locator('.speech-mic').count(), 0);
    assert.equal(await primary(page).innerText(), '继续');
    assert.deepEqual(await record(page), original);
    const next = await continueOnce(page);
    assert.equal(next.session.answers[0].speech.source, 'skipped');
    assert.deepEqual(next.lessons, original.lessons);
    assert.deepEqual(next.knowledge, original.knowledge);
    assert.equal(next.session.adaptive.budget, original.session.adaptive.budget);
    assert.equal(await page.evaluate(() => window.__speechCalls.length), 0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.daily-question').waitFor();
    assert.deepEqual(await record(page), next);
  });
  await scenario('legacy-self-draft-and-favorites-preserved', async ({ page, original }) => {
    assert.equal(await page.getByRole('button', { name: '自己表达', exact: true }).count(), 0);
    assert.equal(await page.locator('.daily-checks input').count(), 0);
    await page.getByText('已保存的表达', { exact: true }).click();
    assert.equal(await page.getByText('My saved expression.', { exact: true }).isVisible(), true);
    assert.deepEqual(await record(page), original);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.locator('.daily-question').waitFor();
    assert.deepEqual(await record(page), original);
    const next = await continueOnce(page);
    assert.equal(next.session.answers[0].speech.source, 'skipped');
    assert.deepEqual(next.lessons, original.lessons);
    assert.deepEqual(next.favorites, original.favorites);
  }, { legacy: true });
  await scenario('voluntary-recognition-and-real-normal-slow-audio', async ({ page, original }) => {
    await expand(page);
    await page.getByRole('button', { name: `听示范 ${task.readAloud[0].en}`, exact: true }).click();
    await page.waitForFunction(() => window.__playing.some(item => item.src.includes('/audio/daily/') && item.rate === 1));
    await page.getByRole('button', { name: `慢速朗读 ${task.readAloud[0].en}`, exact: true }).click();
    await page.waitForFunction(() => window.__playing.some(item => item.src.includes('/audio/daily/') && item.rate === .72 && item.preservesPitch));
    await mic(page).click();
    await page.evaluate(text => window.__emitSpeech(text), task.readAloud[0].en);
    await page.getByText('已核对识别文字。', { exact: true }).waitFor();
    const saved = await record(page);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByText('已核对识别文字。', { exact: true }).waitFor();
    assert.deepEqual(await record(page), saved);
    const next = await continueOnce(page);
    assert.equal(next.session.answers[0].speech.source, 'recognition');
    assert.equal(next.lessons[lessons[0].id].skills.speaking.selfReports, 1);
    for (const id of task.knowledgeIds) assert.equal(next.learning.targets[id].confidence, original.learning.targets[id].confidence);
  });
  await scenario('three-mismatches-do-not-force-retry-or-self-check', async ({ page, original }) => {
    await expand(page);
    for (let attempt = 1; attempt <= 3; attempt++) {
      await mic(page).click();
      await page.evaluate(() => window.__emitSpeech('unrelated sentence'));
      await page.waitForFunction(({ id, attempt }) => JSON.parse(localStorage.getItem('codewords-daily-v1')).session.draft.speech.attempts[id] === attempt, { id: task.readAloud[0].id, attempt });
    }
    assert.equal((await record(page)).session.feedback, null);
    assert.equal(await primary(page).isEnabled(), true);
    const next = await continueOnce(page);
    assert.equal(next.session.answers[0].speech.source, 'skipped');
    assert.deepEqual(next.lessons, original.lessons);
  });
  await scenario('unsupported-browser-can-continue', async ({ page }) => {
    await expand(page);
    await page.getByText('当前无法使用语音识别，可以听示范或直接继续。', { exact: true }).waitFor();
    assert.equal(await mic(page).isDisabled(), true);
    await continueOnce(page);
  }, { unsupported: true });
  for (const code of ['network', 'not-allowed', 'language-not-supported']) await scenario(`error-${code}-can-continue`, async ({ page }) => {
    await expand(page); await mic(page).click();
    await page.evaluate(code => window.__speechCalls.at(-1).onerror?.({ error: code }), code);
    await page.locator('.speech-error').waitFor();
    assert.ok(!(await page.locator('.speech-error').innerText()).includes('自己表达'));
    await continueOnce(page);
  });
  for (const phase of ['starting', 'listening', 'processing']) await scenario(`leave-${phase}-cancels-late-result`, async ({ page }) => {
    await expand(page); await mic(page).click();
    await page.evaluate(() => { window.__lateResult = window.__speechCalls.at(-1).onresult; window.__lateEnd = window.__speechCalls.at(-1).onend; });
    if (phase === 'processing') await mic(page).click();
    assert.equal(await primary(page).isEnabled(), true);
    const next = await continueOnce(page);
    assert.equal(await page.evaluate(() => window.__speechCalls.at(-1).aborted), true);
    await page.evaluate(text => { window.__lateResult?.({ results: [{ isFinal: true, 0: { transcript: text } }] }); window.__lateEnd?.(); }, task.readAloud[0].en);
    assert.deepEqual(await record(page), next);
  }, { phase });
  await scenario('last-optional-item-finishes-and-restores-summary', async ({ page }) => {
    const next = await continueOnce(page);
    await page.getByRole('heading', { name: '这一课已完成', exact: true }).waitFor();
    assert.equal(next.session.stage, 'summary');
    assert.equal(next.learning.rounds, 1);
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.getByRole('heading', { name: '这一课已完成', exact: true }).waitFor();
    assert.deepEqual(await record(page), next);
  }, { final: true });
  await scenario('desktop-mobile-and-four-palettes', async ({ page }) => {
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width > 600 ? 1000 : 844 });
      for (const theme of width === 320 ? ['lagoon'] : ['lagoon', 'pearl', 'sky', 'mint']) {
        await page.getByLabel('界面配色', { exact: true }).selectOption(theme);
        await checkLayout(page, `daily-${width}-${theme}-closed`);
        await expand(page); await page.locator('.daily-speaking').waitFor();
        await checkLayout(page, `daily-${width}-${theme}-open`);
        await expand(page); await page.locator('.daily-speaking').waitFor({ state: 'detached' });
      }
    }
  });
  assert.deepEqual(errors, []);
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ url, results, errors, layouts, recognition: 'simulated callbacks; local example MP3 playback is real' }, null, 2));
  await browser.close();
}
