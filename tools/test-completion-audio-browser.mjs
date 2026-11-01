import assert from 'node:assert/strict';
import { createRequire, registerHooks } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer, parseDailyProgress } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { vocabulary } from '../src/vocabulary.ts';

registerHooks({ resolve(specifier, context, next) {
  try { return next(specifier, context); }
  catch (error) { if (error.code === 'ERR_MODULE_NOT_FOUND' && specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context); throw error; }
} });
const { createLesson, answerLesson, nextLesson } = await import('../src/lesson.ts');

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/completion-audio-20261029';
await mkdir(output, { recursive: true });
function course(lessons) {
  let state = createDailyProgress();
  state.session = planAdaptiveSession(state, lessons, Date.now(), () => .37);
  state = beginAdaptiveLearning(state, lessons);
  for (let i = 0; i < 25; i++) {
    const lesson = resolveAdaptiveLesson(state.session, lessons);
    const task = lesson.exercises.find(item => item.id === state.session.queue[state.session.index].exerciseId);
    state = { ...state, session: updateDailyDraft(state.session, correctDraft(task)) };
    state = recordAdaptiveAnswer(submitDailyAnswer(state, lesson), lessons);
    const next = advanceAdaptiveSession(state, lessons);
    if (next.session.stage === 'summary') {
      assert.equal(parseDailyProgress(JSON.stringify(state), lessons).writable, true);
      return state;
    }
    state = next;
  }
  throw new Error('fixture did not finish');
}
function review() {
  let lesson = createLesson(vocabulary.slice(0, 3), {}, {});
  while (true) {
    lesson = answerLesson(lesson, lesson.tasks[lesson.index].words.map(word => ({ wordId: word.id, outcome: 'independent' })));
    const next = nextLesson(lesson);
    if (next.finished) return { version: 1, active: true, lesson, feedback: { correct: true, message: '答对了', answer: '' } };
    lesson = next;
  }
}
const fixtures = {
  programming: { local: { 'codewords-programming-course-v1': JSON.stringify(course(adaptiveProgrammingLessons)) } },
  daily: { local: { 'codewords-daily-v1': JSON.stringify(course(adaptiveDailyLessons)) } },
  review: { session: { 'codewords-review-session-v1': JSON.stringify(review()) } },
};
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const [kind, fixture] of Object.entries(fixtures)) for (const interruption of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    await page.addInitScript(({ kind, fixture, interruption }) => {
      if (!sessionStorage.getItem('completion-test')) {
        localStorage.setItem('codewords-section', kind === 'daily' ? 'daily' : 'programming');
        Object.entries(fixture.local || {}).forEach(([key, value]) => localStorage.setItem(key, value));
        Object.entries(fixture.session || {}).forEach(([key, value]) => sessionStorage.setItem(key, value));
        sessionStorage.setItem('completion-test', '1');
      }
      window.audioEvents = [];
      let interrupted = false;
      const Original = window.Audio;
      window.Audio = function (...args) {
        const audio = new Original(...args);
        for (const type of ['play', 'playing', 'pause', 'ended', 'error']) audio.addEventListener(type, () => window.audioEvents.push({ type, src: audio.src, position: audio.currentTime, duration: audio.duration }));
        // A one-off external media interruption must recover; explicit app
        // navigation/muting still cancels rather than restarting the cue.
        if (interruption) audio.addEventListener('playing', () => {
          if (!interrupted && audio.src.includes('/feedback/complete.mp3')) {
            interrupted = true;
            audio.pause();
          }
        });
        return audio;
      };
      window.Audio.prototype = Original.prototype;
    }, { kind, fixture, interruption });
    await page.goto(baseURL);
    const button = page.getByRole('button', { name: kind === 'review' ? '完成复习' : '继续', exact: true });
    await button.click();
    try {
      await page.waitForFunction(() => window.audioEvents.some(e => e.type === 'ended' && e.src.includes('/feedback/complete.mp3')), undefined, { timeout: 25000 });
      const events = await page.evaluate(() => window.audioEvents);
      if (kind === 'review') assert.equal(await page.evaluate(() => JSON.parse(sessionStorage.getItem('codewords-review-session-v1')).lesson.finished), true);
      else assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).session.stage, kind === 'daily' ? 'codewords-daily-v1' : 'codewords-programming-course-v1'), 'summary');
      await page.reload();
      await page.waitForLoadState('networkidle');
      assert.equal(await page.evaluate(() => window.audioEvents.filter(e => e.src.includes('/feedback/')).length), 0, 'restoring completion must remain silent');
      results.push({ kind, interruption, passed: true, events });
      console.log(`PASS ${kind}, interruption=${interruption}: completion MP3 ended`);
    } catch (error) {
      results.push({ kind, interruption, passed: false, events: await page.evaluate(() => window.audioEvents), error: error.message });
      console.log(`FAIL ${kind}, interruption=${interruption}: completion MP3 missing or interrupted`);
    }
    await context.close();
  }
} finally { await browser.close(); }
await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
assert.ok(results.every(result => result.passed), JSON.stringify(results, null, 2));
