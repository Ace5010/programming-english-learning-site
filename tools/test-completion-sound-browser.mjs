// Isolated Chrome records real completion MP3 playback and preserves user storage.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession, updateDailyDraft, submitDailyAnswer, parseDailyProgress } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { correctDraft } from './helpers/course-answer.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://127.0.0.1:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve(process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/completion-sound-20261009/browser');
await mkdir(output, { recursive: true });
const results = [];
const syncPending = process.env.CODEWORDS_COMPLETION_SYNC_PENDING === '1';
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const programmingTasks = new Map(adaptiveProgrammingLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...(lesson.practice ?? [])]).map(task => [task.id, task]));

function fixture(section, answered = true) {
  const lessons = section === 'programming' ? adaptiveProgrammingLessons : adaptiveDailyLessons;
  const key = section === 'programming' ? 'codewords-programming-course-v1' : 'codewords-daily-v1';
  let progress = createDailyProgress();
  if (section === 'programming') {
    progress.session = planAdaptiveSession(progress, lessons, Date.now(), () => .42);
    progress = beginAdaptiveLearning(progress, lessons);
    while (progress.session.answers.length < progress.session.adaptive.budget) {
      const lesson = resolveAdaptiveLesson(progress.session, lessons);
      const task = lesson.exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
      progress.session = updateDailyDraft(progress.session, correctDraft(task));
      if (!answered && progress.session.answers.length === progress.session.adaptive.budget - 1) break;
      progress = recordAdaptiveAnswer(submitDailyAnswer(progress, lesson), lessons);
      if (progress.session.answers.length < progress.session.adaptive.budget) progress = advanceAdaptiveSession(progress, lessons, Date.now(), () => .42);
    }
  } else {
    const lesson = lessons.find(item => item.exercises.some(task => task.kind === 'choice'));
    const task = lesson.exercises.find(item => item.kind === 'choice');
    const now = Date.now(), ids = task.knowledgeIds;
    progress.learning = { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
    progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 1 } };
    progress.session = updateDailyDraft(progress.session, correctDraft(task));
    if (answered) progress = recordAdaptiveAnswer(submitDailyAnswer(progress, lesson), lessons);
  }
  assert.equal(progress.session.stage, 'exercise');
  assert.equal(!!progress.session.feedback, answered);
  assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, true);
  return { key, progress };
}

try {
  for (const section of ['programming', 'daily']) for (const width of [1440, 390]) for (const answered of [true, false]) {
    if (syncPending && (width !== 1440 || !answered)) continue;
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const state = fixture(section, answered), errors = [];
    let completionRequests = 0;
    if (process.env.CODEWORDS_COMPLETION_NETWORK_FAULT === '1') await context.route('**/audio/feedback/complete.mp3', route => {
      completionRequests++;
      return completionRequests <= 2 ? route.abort('failed') : route.continue();
    });
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ section, key, progress }) => {
      if (!sessionStorage.getItem('completion-qa')) {
        localStorage.setItem('codewords-section', section);
        localStorage.setItem(key, JSON.stringify(progress));
        sessionStorage.setItem('completion-qa', '1');
      }
      window.__completionAudio = [];
      const OriginalAudio = window.Audio;
      function Audio(...args) {
        const audio = new OriginalAudio(...args);
        for (const type of ['playing', 'pause', 'ended', 'error', 'waiting']) audio.addEventListener(type, () => window.__completionAudio.push({ type, src: audio.src, position: audio.currentTime, time: performance.now() }));
        for (const method of ['play', 'pause']) {
          const original = audio[method].bind(audio);
          audio[method] = (...args) => {
            window.__completionAudio.push({ type: method + '-request', src: audio.src, time: performance.now(), stack: new Error().stack });
            return original(...args);
          };
        }
        return audio;
      }
      Audio.prototype = OriginalAudio.prototype;
      Object.setPrototypeOf(Audio, OriginalAudio);
      window.Audio = Audio;
    }, { section, ...state });
    const name = `${section}-${width}-${answered ? 'restored' : 'rapid-check'}`;
    try {
      await page.goto(baseURL);
      const root = page.locator(`#${section}-content`);
      if (!answered) {
        await root.locator('.daily-question').waitFor();
        await root.getByRole('button', { name: '检查', exact: true }).click();
      }
      await root.locator('.daily-feedback').waitFor();
      await root.getByRole('button', { name: '继续', exact: true }).click();
      await root.locator('.daily-summary').waitFor();
      if (syncPending) {
        await page.waitForFunction(() => window.__completionAudio.some(event => event.type === 'playing' && event.src.includes('/feedback/complete.mp3')));
        const blocked = await page.evaluate(async () => {
          const { canApplySync, REMOTE_APPLIED } = await import('/src/progressStorage.ts');
          // Model the sync client's existing guard, without a cloud request or credential.
          if (canApplySync()) { window.dispatchEvent(new Event(REMOTE_APPLIED)); return false; }
          return true;
        });
        assert.equal(blocked, true, 'remote progress must wait until the completion cue ends');
      }
      await page.waitForFunction(() => window.__completionAudio.some(event => event.type === 'ended' && event.src.includes('/feedback/complete.mp3')), undefined, { timeout: 5000 });
      if (syncPending) assert.equal(await page.evaluate(async () => (await import('/src/progressStorage.ts')).canApplySync()), true, 'sync resumes after playback');
      const saved = await page.evaluate(key => JSON.parse(localStorage.getItem(key)), state.key);
      assert.equal(saved.session.stage, 'summary');
      assert.equal(await page.evaluate(() => window.__completionAudio.filter(event => event.type === 'playing' && event.src.includes('/feedback/complete.mp3')).length), 1);
      if (section === 'programming' && width === 1440 && !answered) {
        await root.getByRole('button', { name: '开始下一课', exact: true }).click();
        for (let index = 0; index < 10; index++) {
          const form = root.locator('.daily-question');
          await form.waitFor();
          const task = programmingTasks.get(await form.getAttribute('data-exercise-id'));
          assert.ok(task);
          if (task.kind === 'choice') await form.getByRole('button', { name: task.answers[0], exact: true }).click();
          else {
            assert.equal(task.kind, 'fill');
            await form.locator('input[data-blank]').fill(correctDraft(task).blanks[0]);
          }
          await root.getByRole('button', { name: '检查', exact: true }).click();
          await root.getByRole('button', { name: '继续', exact: true }).click();
        }
        await root.locator('.daily-summary').waitFor();
        await page.waitForFunction(() => window.__completionAudio.filter(event => event.type === 'ended' && event.src.includes('/feedback/complete.mp3')).length === 2, undefined, { timeout: 5000 });
        assert.equal(await page.evaluate(() => window.__completionAudio.filter(event => event.type === 'playing' && event.src.includes('/feedback/complete.mp3')).length), 2, 'the next lesson reuses the completion cue successfully');
      }
      const events = await page.evaluate(() => window.__completionAudio);
      await page.reload();
      await root.locator('.daily-summary').waitFor();
      assert.equal(await page.evaluate(() => window.__completionAudio.filter(event => event.type === 'play-request').length), 0, 'refresh must not replay completion');
      assert.deepEqual(errors, []);
      results.push({ name, passed: true, completionRequests, events });
      console.log(`PASS ${name}`);
    } catch (error) {
      const events = await page.evaluate(() => window.__completionAudio);
      results.push({ name, passed: false, error: error.stack, completionRequests, events, errors });
      await page.screenshot({ path: path.join(output, `${name}-failed.png`), fullPage: true });
      console.error(`FAIL ${name}: ${error.message}`);
    } finally { await context.close(); }
  }
} finally {
  await browser.close();
  await writeFile(path.join(output, 'results.json'), JSON.stringify({ baseURL, results }, null, 2));
}
assert.ok(results.every(result => result.passed), 'completion playback failed; see results.json');
