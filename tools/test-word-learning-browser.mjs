import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { createDailyProgress, createDailySession, learnDailyLesson, checkDailyAttempt, createDailyDraft, parseDailyProgress } from '../src/dailyProgress.ts';
import { resolveAdaptiveLesson } from '../src/adaptiveLearning.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/word-learning'; await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [], audio = [];
function fixture(stage = 'exercise') {
  const lesson = lessons.find(lesson => lesson.id === 'A1-03-02');
  const task = lesson.practice.find(task => task.id.endsWith('-i-am-a-student-write'));
  let progress = learnDailyLesson(createDailyProgress(), lesson);
  progress.learning = { version: 1, rounds: 0, turns: 5, targets: Object.fromEntries(Object.keys(progress.knowledge).map(id => [id, { introducedAt: Date.now() - 86400000, confidence: .6, abilities: { meaning: .6 }, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson'), stage,
    adaptive: { version: 1, round: 1, focusIds: ['i-am-a-student', 'daily-word-student', 'daily-word-teacher'], newIds: [], sourceLessonId: lesson.id, seed: 4, budget: 8 } };
  if (stage === 'summary') {
    progress.session.stage = 'exercise'; progress.session.draft.text = 'I am a student.';
    progress = checkDailyAttempt(progress, resolveAdaptiveLesson(progress.session, lessons));
    progress.session = { ...progress.session, stage: 'summary', index: 1, feedback: null, draft: createDailyDraft() };
  }
  assert.ok(parseDailyProgress(JSON.stringify(progress), lessons).writable);
  return progress;
}
async function open(progress, width = 390, theme = 'lagoon') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', res => { if (res.status() >= 400 && res.url().endsWith('.mp3')) errors.push(res.url()); });
  await page.addInitScript(({ progress, theme }) => {
    if (!sessionStorage.getItem('word-test')) {
      localStorage.setItem('codewords-section', 'daily'); localStorage.setItem('codewords-theme', theme);
      localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
      localStorage.setItem('codewords-mastered', '[1]'); sessionStorage.setItem('word-test', '1');
    }
    window.audioEvents = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      for (const type of ['playing', 'ended']) this.addEventListener(type, () => window.audioEvents.push({ type, src: this.src, rate: this.playbackRate, pitch: this.preservesPitch, duration: this.duration }), { once: true });
      return play.apply(this, args);
    };
  }, { progress, theme });
  await page.goto(baseURL); const main = page.locator('#daily-content'); await main.waitFor();
  return { page, main, context };
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
async function layout(page, name) {
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  assert.equal(await page.locator('button button').count(), 0);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
try {
  for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
    const { page, main, context } = await open(fixture('study'), theme === 'lagoon' ? 1440 : 320, theme);
    await main.getByRole('button', { name: '朗读 student', exact: true }).waitFor();
    assert.ok((await main.innerText()).includes('本轮重点词'));
    if (theme === 'lagoon') {
      const card = main.locator('.daily-phrase').filter({ has: page.getByRole('button', { name: '朗读 student', exact: true }) });
      await card.getByRole('button', { name: '朗读 student', exact: true }).click();
      await page.waitForFunction(() => window.audioEvents.some(item => item.src.includes('daily-word-student') && item.rate === 1));
      await card.getByRole('button', { name: /慢速/ }).first().click();
      await page.waitForFunction(() => window.audioEvents.some(item => item.src.includes('daily-word-student') && item.rate === .72 && item.pitch));
      audio.push(...await page.evaluate(() => window.audioEvents));
    }
    await layout(page, `study-${theme}`); await context.close(); results.push(`study-${theme}`);
  }
  {
    const { page, main, context } = await open(fixture());
    const before = (await saved(page)).learning.targets['daily-word-teacher'];
    await main.locator('textarea').fill('I am a studnet.');
    await main.getByRole('button', { name: '检查', exact: true }).click();
    await main.getByText('已记录这个重点词的拼写困难，后续会单独补练。').waitFor();
    const draft = (await saved(page)).session.draft;
    await page.reload(); await main.locator('.answer-correction').waitFor();
    assert.deepEqual((await saved(page)).session.draft, draft);
    await main.locator('textarea').fill('I am a student.');
    await main.getByRole('button', { name: '再检查', exact: true }).click();
    await main.locator('.daily-feedback').waitFor();
    assert.deepEqual((await saved(page)).learning.targets['daily-word-teacher'], before);
    assert.equal((await saved(page)).knowledge['daily-word-student'].skills.writing.assistedAnswers, 1);
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-mastered')), '[1]');
    await layout(page, 'correction-restored'); await context.close(); results.push('local-correction-reload-isolation');
  }
  {
    const { page, main, context } = await open(fixture('summary'));
    await main.getByRole('button', { name: '巩固本课重点词', exact: true }).click();
    await main.locator('.daily-question').waitFor();
    const progress = await saved(page); assert.equal(progress.session.wordPractice, true);
    assert.deepEqual(progress.session.adaptive.focusIds, ['daily-word-student', 'daily-word-teacher']);
    const id = await main.locator('.daily-question').getAttribute('data-exercise-id');
    await page.reload(); await main.locator('.daily-question').waitFor();
    assert.equal(await main.locator('.daily-question').getAttribute('data-exercise-id'), id);
    await layout(page, 'word-practice'); await context.close(); results.push('summary-practice-reload');
  }
  {
    const progress = fixture();
    const task = lessons.find(item => item.id === progress.session.lessonId).practice.find(task => task.id.endsWith('-daily-word-student-write'));
    progress.session.queue = [{ exerciseId: task.id, retry: false }]; progress.session.draft = createDailyDraft(task);
    const { page, main, context } = await open(progress);
    await main.getByRole('button', { name: '提示', exact: true }).click();
    await main.getByText('首字母是 s，共 7 个字母。').waitFor();
    await main.locator('textarea').fill('student');
    await main.getByRole('button', { name: '检查', exact: true }).click();
    await main.locator('.daily-feedback').waitFor();
    assert.equal((await saved(page)).session.answers[0].outcome, 'assisted');
    assert.equal((await saved(page)).learning.targets['daily-word-student'].evidence.recall.assisted, 1);
    await context.close(); results.push('first-letter-help-evidence');
  }
  {
    const { page, main, context } = await open(fixture('summary'));
    await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '词汇库', exact: true }).click();
    await main.getByRole('searchbox').fill('student');
    await main.getByRole('button', { name: '练习这个词', exact: true }).click();
    await main.locator('.daily-question').waitFor();
    assert.deepEqual((await saved(page)).session.adaptive.focusIds, ['daily-word-student']);
    await context.close(); results.push('library-single-word-practice');
  }
  {
    const { page, main, context } = await open(fixture('summary'));
    await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '词汇库', exact: true }).click();
    const before = await saved(page);
    for (const voice of ['aria', 'guy']) {
      await main.getByRole('button', { name: '语音设置', exact: true }).click();
      await page.getByLabel('点读声音', { exact: true }).selectOption(voice);
      await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
      for (const word of ['from', 'student', 'teacher']) {
        await main.getByRole('searchbox').fill(word);
        const row = main.locator('.daily-expression').filter({ has: page.getByRole('button', { name: `朗读 ${word}`, exact: true }) });
        for (const rate of [1, .72]) {
          const start = await page.evaluate(() => window.audioEvents.length);
          await row.getByRole('button', { name: rate === 1 ? `朗读 ${word}` : `慢速朗读 ${word}`, exact: true }).click();
          await page.waitForFunction(({ start, voice, word, rate }) => window.audioEvents.slice(start).some(event =>
            event.type === 'ended' && event.src.includes(`/audio/daily/${voice}/daily-word-${word}.mp3`)
            && event.rate === rate && event.pitch && event.duration > 0), { start, voice, word, rate });
        }
      }
    }
    assert.deepEqual(await saved(page), before, 'Normal/slow playback adds no learning evidence');
    audio.push(...await page.evaluate(() => window.audioEvents));
    await context.close(); results.push('all-six-pilot-recordings-play-to-end-at-normal-and-slow-speed');
  }
  assert.deepEqual(errors, []);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ results, errors, audio }, null, 2)); await browser.close();
}
console.log(JSON.stringify({ passed: results.length, results, audioEvents: audio.length }));
