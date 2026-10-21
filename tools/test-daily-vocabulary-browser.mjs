import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons as lessons, legacyAdaptiveDailyLessons } from '../src/dailyPractice.ts';
import { dailyVocabularyWords } from '../src/dailyVocabulary.ts';
import { createDailyProgress, createDailySession, createDailyDraft, learnDailyLesson, checkDailyAttempt, parseDailyProgress } from '../src/dailyProgress.ts';
import { beginAdaptiveLearning, planAdaptiveSession, resolveAdaptiveLesson, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { expectedSlowQueue } from './helpers/slow-audio-expectation.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://127.0.0.1:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/daily-vocabulary-20261021';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [], audio = [], rounds = [];
const bundles = new Set();
const catalog = new Map(lessons.flatMap(lesson => lesson.practice).map(task => [task.id, task]));
async function open(progress, width = 1440, theme = 'lagoon', voice = 'aria') {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400 && /\.(mp3|js|css)(\?|$)/.test(response.url())) errors.push(`${response.status()} ${response.url()}`); });
  await page.addInitScript(({ progress, theme, voice }) => {
    if (!sessionStorage.getItem('daily-vocabulary-qa')) {
      localStorage.setItem('codewords-section', 'daily'); localStorage.setItem('codewords-theme', theme); localStorage.setItem('codewords-voice', voice);
      localStorage.setItem('codewords-mastered', '[1,2]');
      if (progress) localStorage.setItem('codewords-daily-v1', JSON.stringify(progress));
      sessionStorage.setItem('daily-vocabulary-qa', '1');
    }
    window.qaAudio = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      for (const type of ['playing', 'ended', 'error']) this.addEventListener(type, () => window.qaAudio.push({ type, src: this.src, rate: this.playbackRate, pitch: this.preservesPitch, duration: this.duration }), { once: true });
      return play.apply(this, args);
    };
  }, { progress, theme, voice });
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }); const root = page.locator('#daily-content'); await root.waitFor();
  for (const script of await page.evaluate(() => [...document.scripts].map(script => script.src).filter(src => /\/assets\/[^/]+\.js/.test(src)))) bundles.add(script);
  return { page, root, context };
}
const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('codewords-daily-v1')));
const go = (page, name) => page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click();
async function layout(page, name) {
  const report = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
    nested: document.querySelectorAll('button button').length,
    overflow: [...document.querySelectorAll('main:not([hidden]) button, main:not([hidden]) input, main:not([hidden]) textarea')].filter(el => {
      const box = el.getBoundingClientRect(); return box.width && box.height && (box.left < -1 || box.right > innerWidth + 1);
    }).map(el => el.textContent) }));
  assert.ok(report.scroll <= report.width + 1, JSON.stringify(report)); assert.equal(report.nested, 0); assert.deepEqual(report.overflow, []);
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
async function answerUI(env, wrong = false, help = false) {
  const { page, root } = env, state = await saved(page), entry = state.session.queue[state.session.index];
  const task = catalog.get(entry.exerciseId), question = root.locator('.daily-question');
  assert.ok(task); await question.waitFor();
  if (help) await root.getByRole('button', { name: '提示', exact: true }).click();
  if (task.kind === 'choice' || task.kind === 'listen') {
    const option = wrong ? task.options.find(option => !task.answers.includes(option)) : task.answers[0];
    await question.getByRole('button', { name: option, exact: true }).click();
  } else if (task.kind === 'fill') {
    for (const [index, values] of task.blanks.entries()) await question.getByLabel(`第 ${index + 1} 个空`).fill(wrong ? 'xyz' : values[0]);
  } else if (task.kind === 'write') await question.locator('textarea').fill(wrong ? 'xyz' : task.answers[0]);
  else throw new Error(`Unexpected new-course task: ${task.kind}`);
  await root.locator('.daily-controls .primary').click();
  if (wrong && ['fill', 'write'].includes(task.kind)) {
    await root.locator('.answer-correction').waitFor();
    if (task.kind === 'fill') for (const [index, values] of task.blanks.entries()) await question.getByLabel(`第 ${index + 1} 个空`).fill(values[0]);
    else await question.locator('textarea').fill(task.answers[0]);
    await root.locator('.daily-controls .primary').click();
  }
  await root.locator('.daily-feedback').waitFor();
  return task;
}
function roundFixture(count, initial = createDailyProgress()) {
  let progress = initial;
  for (let round = 0; round < count; round++) {
    progress.session = planAdaptiveSession(progress, lessons, Date.now(), () => .37);
    progress = beginAdaptiveLearning(progress, lessons);
    while (progress.session.stage === 'exercise') {
      const task = catalog.get(progress.session.queue[progress.session.index].exerciseId);
      progress.session.draft = correctDraft(task);
      progress = advanceAdaptiveSession(checkDailyAttempt(progress, resolveAdaptiveLesson(progress.session, lessons)), lessons);
    }
  }
  return progress;
}
try {
  for (const [width, theme] of [[1440, 'lagoon'], [390, 'lagoon'], [320, 'pearl'], [390, 'sky'], [390, 'mint']]) {
    const env = await open(null, width, theme);
    assert.equal(await env.root.locator('.course-word-card').count(), 6);
    assert.equal(await env.root.locator('.course-word-phonetic').count(), 6);
    await env.root.getByRole('heading', { name: '常用表达', exact: true }).waitFor();
    assert.equal(await saved(env.page), null, 'Viewing cards does not enroll words');
    await layout(env.page, `home-${width}-${theme}`); await env.context.close(); results.push(`layout-${width}-${theme}`);
  }
  for (const voice of ['aria', 'guy']) {
    const env = await open(null, 1440, 'lagoon', voice), card = env.root.locator('[data-target-id="daily-word-i"]');
    for (const [label, rate, part] of [['朗读 I', 1, 'daily-word-i.mp3'], ['慢速朗读 I', .72, 'daily-word-i.mp3'], ['朗读 I am Ben.', 1, 'daily-word-i-example-1.mp3'], ['慢速朗读 I am Ben.', .72, 'daily-word-i-example-1.mp3'], ['朗读 I', 1, 'daily-word-i.mp3']]) {
      await env.page.evaluate(() => { window.qaAudio = []; });
      await card.getByRole('button', { name: label, exact: true }).click();
      const queue = rate === .72 ? expectedSlowQueue(part, voice, url) : null;
      const expected = queue?.[0]?.url ?? `/daily/${voice}/${part}`;
      await env.page.waitForFunction(({ rate, expected }) => window.qaAudio.some(item => item.type === 'playing' && item.src.includes(expected) && item.rate === rate), { rate, expected });
      await env.page.waitForFunction(() => !document.querySelector('.course-word-card.word-playing, .course-word-card.example-playing'));
      const events = await env.page.evaluate(() => window.qaAudio); assert.ok(events.every(item => item.pitch)); audio.push({ voice, label, events });
    }
    assert.equal(await saved(env.page), null);
    await go(env.page, '词汇库');
    for (const rate of [1, .72]) {
      await env.page.evaluate(() => { window.qaAudio = []; });
      await env.root.getByRole('button', { name: `${rate === 1 ? '朗读' : '慢速朗读'} live`, exact: true }).click();
      try {
        await env.page.waitForFunction(({ voice, rate }) => window.qaAudio.some(item => item.type === 'ended' && item.src.includes(`/daily/${voice}/daily-word-live.mp3?v=live%7Cverb-v1`) && item.rate === rate), { voice, rate });
      } catch (error) {
        await writeFile(`${output}/audio-failure.json`, JSON.stringify({ voice, rate, events: await env.page.evaluate(() => window.qaAudio) }, null, 2)); throw error;
      }
      audio.push({ voice, label: `live-${rate}`, events: await env.page.evaluate(() => window.qaAudio) });
    }
    await env.context.close(); results.push(`real-local-audio-${voice}`);
  }
  {
    const env = await open(null, 390); await env.root.getByRole('button', { name: '开始练习', exact: true }).click();
    await env.root.locator('.daily-question').waitFor();
    await answerUI(env, true); const receipt = await saved(env.page);
    await env.page.reload(); await env.root.locator('.daily-feedback').waitFor();
    assert.deepEqual((await saved(env.page)).session, receipt.session);
    await layout(env.page, 'wrong-feedback-390'); await env.root.locator('.daily-controls .primary').click();
    let firstHelp = true;
    while ((await saved(env.page)).session.stage !== 'summary') {
      await answerUI(env, false, firstHelp); firstHelp = false;
      await env.root.locator('.daily-controls .primary').click();
    }
    const complete = await saved(env.page); rounds.push(complete.session);
    assert.ok(complete.session.answers.some(answer => !answer.correct)); assert.ok(complete.session.answers.some(answer => answer.outcome === 'assisted'));
    await layout(env.page, 'summary-390');
    await env.root.getByRole('button', { name: '开始下一课', exact: true }).click();
    await env.root.locator('.course-word-card').first().waitFor();
    const next = await saved(env.page); assert.equal(next.session.stage, 'study'); assert.equal(next.session.answers.length, 0);
    await layout(env.page, 'next-lesson-390'); await env.context.close(); results.push('wrong-help-reload-complete-next-study');
  }
  {
    const oldLesson = legacyAdaptiveDailyLessons.find(lesson => lesson.id === 'A1-01-02');
    let old = learnDailyLesson(createDailyProgress(), oldLesson);
    old.favorites = ['hello', 'from-china']; old.session = createDailySession(oldLesson);
    old.session.stage = 'exercise'; old.session.draft = { ...createDailyDraft(oldLesson.exercises[0]), choice: oldLesson.exercises[0].options[0] };
    const env = await open(old);
    await env.root.locator('.daily-question').waitFor(); assert.deepEqual((await saved(env.page)).session, old.session);
    await go(env.page, '收藏'); await env.root.getByRole('button', { name: '朗读 Hello!', exact: true }).waitFor();
    await env.root.getByRole('button', { name: '朗读 I am from China.', exact: true }).waitFor();
    await layout(env.page, 'legacy-favorites');
    await go(env.page, '词汇库'); assert.equal(await env.root.locator('.daily-expression').count(), 72);
    await env.root.getByRole('button', { name: '收藏 book', exact: true }).click();
    await env.root.getByLabel('词汇类型').selectOption('expressions');
    await env.root.getByRole('searchbox').fill('China');
    await go(env.page, '收藏');
    await env.root.getByRole('button', { name: '朗读 book', exact: true }).waitFor();
    assert.deepEqual((await saved(env.page)).favorites, ['hello', 'from-china', 'daily-word-book']);
    await env.page.reload(); await go(env.page, '收藏'); await env.root.getByRole('button', { name: '朗读 book', exact: true }).waitFor();
    assert.deepEqual((await saved(env.page)).session, old.session);
    assert.equal(await env.page.evaluate(() => localStorage.getItem('codewords-mastered')), '[1,2]');
    await env.context.close(); results.push('legacy-session-favorites-library-isolation');
  }
  {
    const env = await open(null, 390); const before = await env.root.locator('.course-word-card').first().getAttribute('data-target-id');
    await env.root.getByRole('button', { name: '这些我都会，跳过本课', exact: true }).click();
    await env.root.getByRole('button', { name: '撤销跳过', exact: true }).click();
    assert.equal(await env.root.locator('.course-word-card').first().getAttribute('data-target-id'), before);
    await env.context.close(); results.push('skip-undo-same-scope');
  }
  {
    const fixture = roundFixture(1); fixture.session = null;
    fixture.learning.targets['daily-word-i'].readyAt = Date.now() - 86400000;
    const env = await open(fixture, 390); await go(env.page, '复习');
    await env.root.getByRole('button', { name: '朗读 I', exact: true }).waitFor(); await layout(env.page, 'review-390');
    await env.root.getByRole('button', { name: '练习相关词汇', exact: true }).first().click();
    while ((await saved(env.page)).session.stage !== 'summary') {
      await answerUI(env); await env.root.locator('.daily-controls .primary').click();
    }
    await env.root.locator('.daily-summary').waitFor(); await layout(env.page, 'review-summary-390');
    await env.context.close(); results.push('admitted-word-review-real-answer');
  }
  // Later authored themes render from records earned by the actual local grading rules.
  for (const [sourceId, name, wordId] of [['DV1-02-01', 'places', 'daily-word-from'], ['DV1-03-01', 'family', 'daily-word-family'], ['DV1-04-01', 'objects', 'daily-word-book'], ['DV1-04-02', 'food', 'daily-word-apple'], ['DV1-04-03', 'late-course', 'daily-word-this']]) {
    let fixture = createDailyProgress(), count = 0;
    while (planAdaptiveSession({ ...fixture, session: null }, lessons).lessonId !== sourceId) {
      assert.ok(count++ < 35); fixture = roundFixture(1, fixture);
    }
    fixture.session = null;
    const env = await open(fixture, 1440); await layout(env.page, `home-${name}-1440`);
    await env.root.locator(`[data-target-id="${wordId}"]`).waitFor();
    const cards = await env.root.locator('.course-word-card').count(); assert.ok(cards >= 1);
    await env.root.getByRole('button', { name: '开始练习', exact: true }).click(); await answerUI(env);
    await layout(env.page, `exercise-${name}-1440`); await env.context.close(); results.push(`later-theme-${name}`);
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify({ url, bundles: [...bundles], results, errors, audio, rounds, words: dailyVocabularyWords.length, note: 'Isolated Chrome browser data; later-theme and review setup uses synthetic local records.' }, null, 2));
  await browser.close();
}
assert.deepEqual(errors, []); console.log(`PASS ${results.length} browser scenarios; ${audio.length} complete local playbacks.`);
