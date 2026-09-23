// Isolated Chrome regression for the programming review word list.
// The seed starts from real UI-earned adaptive progress; dates only arrange review statuses.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vocabulary } from '../src/vocabulary.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { parseDailyProgress } from '../src/dailyProgress.ts';
import { REVIEW_KEY, parseReviewProgress, serializeReviewProgress, reviewAbilities, isReviewEligible } from '../src/review.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve('artifacts/review-page');
const earned = JSON.parse(await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8')).programming;
const course = JSON.parse(earned.course);
assert.equal(parseDailyProgress(earned.course, adaptiveProgrammingLessons).writable, true);
const originalReview = parseReviewProgress(earned.review);
const admitted = vocabulary.filter(word => isReviewEligible(originalReview, word.id));
const stillLearning = vocabulary.filter(word => originalReview[word.id]?.reviewReadyAt === 0);
assert.equal(admitted.length, 9, 'This fixture contains nine words admitted by real course answers');
assert.equal(stillLearning.length, 3, 'Three exposed but unready words exercise the admission boundary');
const now = Math.max(...admitted.map(word => originalReview[word.id].reviewReadyAt)) + 3600000;
const review = structuredClone(originalReview);
for (const word of admitted) for (const ability of reviewAbilities) {
  review[word.id][ability].dueAt = now + 7 * 86400000;
  review[word.id][ability].needsPractice = false;
}
review[admitted[0].id].meaning.dueAt = now - 86400000;
review[admitted[1].id].spelling.dueAt = now - 86400000;
review[admitted[1].id].spelling.needsPractice = true;
const legacyIds = [21, 22];
assert.ok(legacyIds.every(id => !originalReview[id]));
const seed = {
  [PROGRAMMING_COURSE_KEY]: earned.course,
  [REVIEW_KEY]: serializeReviewProgress(review),
  'codewords-mastered': JSON.stringify(legacyIds),
  'codewords-favorites': '[17]',
};
const expectedIds = [...admitted.map(word => word.id), ...legacyIds];
const results = [], failures = [], browserErrors = [], scenarios = [];
const loadedApplicationScripts = new Set();
const raw = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const read = async (page, key) => JSON.parse(await raw(page, key));
async function navigate(page, name) { await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click(); }
const themes = ['minimal', 'sketch', 'print', 'graffiti'];
let browser;
async function open({ state = seed, width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  await page.clock.setFixedTime(new Date(now));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('favicon.ico')) errors.push(event.text()); });
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(state => {
    if (!sessionStorage.getItem('review-page-qa')) {
      localStorage.setItem('codewords-section', 'programming');
      for (const [key, value] of Object.entries(state)) localStorage.setItem(key, value);
      sessionStorage.setItem('review-page-qa', '1');
    }
    const NativeAudio = window.Audio;
    window.__reviewAudio = [];
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args);
      for (const type of ['playing', 'ended', 'error']) audio.addEventListener(type, () => window.__reviewAudio.push({ type, src: audio.src, duration: audio.duration }));
      return audio;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  }, state);
  await page.goto(baseURL);
  const scripts = await page.evaluate(() => [...document.scripts].map(script => script.src).filter(url => /\/assets\/[^/]+\.js/.test(url)));
  for (const script of scripts) loadedApplicationScripts.add(script);
  if (process.env.CODEWORDS_EXPECTED_BUNDLE) assert.ok(scripts.some(url => url.endsWith(process.env.CODEWORDS_EXPECTED_BUNDLE)), 'The actual browser must load the expected final application bundle');
  await page.locator('#programming-content').waitFor({ state: 'visible' });
  await navigate(page, '复习');
  return { page, context, errors };
}
function scenario(name, options, run) { scenarios.push({ name, options, run }); }
async function noOverflow(page) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
  assert.ok(dimensions.width <= dimensions.viewport + 1, JSON.stringify(dimensions));
}
async function answerWord(page, word) {
  const form = page.locator('.lesson-exercise');
  await form.waitFor();
  const type = (await form.getAttribute('class')).match(/lesson-exercise-(\w+)/)[1];
  if (type === 'dictation') {
    const full = form.getByLabel('英文拼写', { exact: true });
    if (await full.count()) await full.fill(word.word);
    else {
      const letters = [...word.word].filter(letter => /[a-z]/i.test(letter));
      for (const input of await form.locator('input[aria-label]').all()) {
        const ordinal = Number((await input.getAttribute('aria-label')).match(/\d+/)[0]);
        await input.fill(letters[ordinal - 1]);
      }
    }
  } else {
    assert.ok(['meaning', 'context', 'listen', 'cloze'].includes(type), `Single-word practice cannot generate ${type}`);
    const answer = type === 'meaning' ? word.meaning : type === 'context' ? word.exampleZh : word.word;
    await form.getByRole('button', { name: answer, exact: true }).click();
  }
  await page.locator('.lesson-footer').getByRole('button', { name: '检查', exact: true }).click();
  await page.locator('.lesson-footer-correct').waitFor();
  await page.locator('.lesson-footer .lesson-primary').click();
}

const panel = page => page.locator('#programming-content section[aria-label="已学词汇"]');
const rows = page => panel(page).locator('article.word-card[data-word-id]');
const row = (page, id) => panel(page).locator(`article.word-card[data-word-id="${id}"]`);
const listedIds = page => rows(page).evaluateAll(elements => elements.map(element => Number(element.dataset.wordId)));
const sorted = ids => ids.slice().sort((a, b) => a - b);
async function assertList(page, ids) { assert.deepEqual(sorted(await listedIds(page)), sorted(ids)); }
async function closeQuiz(page) { await page.getByRole('button', { name: '退出复习', exact: true }).click(); await panel(page).waitFor(); }

scenario('admitted and historical mastered words are immediately visible; unready words excluded', {}, async ({ page }) => {
  await page.locator('#programming-content.programming-review-page').waitFor();
  await assertList(page, expectedIds);
  for (const word of stillLearning) assert.equal(await row(page, word.id).count(), 0, `${word.word} is still learning`);
  for (const id of expectedIds) {
    const word = vocabulary.find(item => item.id === id);
    assert.equal(await row(page, id).getByRole('button', { name: `练习 ${word.word}`, exact: true }).isVisible(), true);
    assert.equal(await row(page, id).locator('.meaning').innerText(), word.meaning);
  }
  assert.equal(await page.locator('.review-scenarios').getAttribute('open'), null, 'Scene practice is collapsed so words lead the page');
  assert.equal(await raw(page, 'codewords-mastered'), seed['codewords-mastered']);
  assert.equal(await raw(page, 'codewords-favorites'), '[17]');
  return { listedIds: await listedIds(page), excludedIds: stillLearning.map(word => word.id) };
});

scenario('English, Chinese and example search combine with all four status filters', {}, async ({ page }) => {
  const search = page.getByLabel('搜索已学词汇', { exact: true });
  const filter = page.getByLabel('复习词汇范围', { exact: true });
  const expectedFilters = { all: expectedIds, due: [admitted[0].id, admitted[1].id, ...legacyIds], weak: [admitted[1].id], scheduled: admitted.slice(2).map(word => word.id) };
  for (const [value, expected] of Object.entries(expectedFilters)) { await filter.selectOption(value); await assertList(page, expected); }
  await filter.selectOption('all');
  const target = admitted[0];
  for (const term of [target.word.toUpperCase(), target.meaning, target.example, target.exampleZh]) {
    await search.fill(term);
    const matching = vocabulary.filter(word => expectedIds.includes(word.id) && `${word.word} ${word.meaning} ${word.example} ${word.exampleZh}`.toLowerCase().includes(term.toLowerCase())).map(word => word.id);
    assert.ok(matching.includes(target.id));
    await assertList(page, matching);
  }
  await search.fill('repository'); await filter.selectOption('scheduled');
  await assertList(page, []);
  assert.equal(await panel(page).getByRole('button', { name: '练习筛选结果', exact: true }).isDisabled(), true);
  await panel(page).getByRole('button', { name: '查看全部已学词', exact: true }).click();
  await assertList(page, expectedIds); assert.equal(await search.inputValue(), '');
  await search.fill('not-a-real-review-word'); await assertList(page, []);
  await page.getByRole('button', { name: '清除已学词搜索', exact: true }).click(); await assertList(page, expectedIds);
  return expectedFilters;
});

scenario('single word practice preserves selected answer across themes and changes only that word', {}, async ({ page }) => {
  const target = admitted[0];
  const before = parseReviewProgress(await raw(page, REVIEW_KEY));
  await row(page, target.id).getByRole('button', { name: `练习 ${target.word}`, exact: true }).click();
  await page.locator('.lesson-overlay').waitFor();
  assert.match(await page.locator('.lesson-context').innerText(), /本轮 1 个词/);
  await page.locator('.lesson-exercise-meaning').waitFor();
  const option = page.locator('.lesson-options').getByRole('button', { name: target.meaning, exact: true });
  await option.click();
  const count = await page.locator('.lesson-count').innerText();
  const options = await page.locator('.lesson-option').allTextContents();
  for (const theme of themes) {
    await page.locator('.lesson-overlay').getByLabel('界面风格', { exact: true }).selectOption(theme);
    assert.equal(await option.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('.lesson-count').innerText(), count);
    assert.deepEqual(await page.locator('.lesson-option').allTextContents(), options);
  }
  // Selecting the same option again is idempotent, so reuse the normal answer helper.
  let answers = 0;
  while (await page.locator('.lesson-exercise').count()) { assert.ok(++answers <= 3); await answerWord(page, target); }
  await page.getByRole('heading', { name: '复习了 1 个词', exact: true }).waitFor();
  const after = parseReviewProgress(await raw(page, REVIEW_KEY));
  assert.notDeepEqual(after[target.id], before[target.id]);
  for (const [id, record] of Object.entries(before)) if (Number(id) !== target.id) assert.deepEqual(after[id], record, `Unselected word ${id} must not be updated`);
  assert.deepEqual(Object.keys(after), Object.keys(before));
  await closeQuiz(page);
  assert.equal(await row(page, target.id).getByRole('button', { name: `练习 ${target.word}`, exact: true }).evaluate(element => element === document.activeElement), true, 'Closing restores the launching word button focus');
  return { wordId: target.id, answers };
});

scenario('filtered practice uses only matching words; batch practice remains capped at five', {}, async ({ page }) => {
  await page.getByLabel('搜索已学词汇', { exact: true }).fill('fork');
  await assertList(page, [5]);
  await panel(page).getByRole('button', { name: '练习筛选结果', exact: true }).click();
  await page.locator('.lesson-overlay').waitFor();
  assert.match(await page.locator('.lesson-context').innerText(), /本轮 1 个词/);
  await answerWord(page, vocabulary.find(word => word.id === 5));
  await closeQuiz(page);
  assert.equal(await page.getByLabel('搜索已学词汇', { exact: true }).inputValue(), 'fork');
  await page.getByRole('button', { name: '清除已学词搜索', exact: true }).click();
  await panel(page).getByRole('button', { name: '练习已学词', exact: true }).click();
  await page.locator('.lesson-overlay').waitFor();
  assert.match(await page.locator('.lesson-context').innerText(), /本轮 5 个词/);
  await closeQuiz(page);
  await panel(page).getByRole('button', { name: '开始到期复习', exact: true }).click();
  await page.locator('.lesson-overlay').waitFor();
  assert.match(await page.locator('.lesson-context').innerText(), /本轮 4 个词/);
});

scenario('click rechecks current storage and will not open a stale unready target', {}, async ({ page }) => {
  const target = admitted[0];
  const next = parseReviewProgress(await raw(page, REVIEW_KEY));
  next[target.id].reviewReadyAt = 0;
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: REVIEW_KEY, value: serializeReviewProgress(next) });
  // No storage event: the page intentionally still renders its previous snapshot before the click.
  assert.equal(await row(page, target.id).count(), 1);
  await row(page, target.id).getByRole('button', { name: `练习 ${target.word}`, exact: true }).click();
  assert.equal(await page.locator('.lesson-overlay').count(), 0);
  assert.equal(await row(page, target.id).count(), 0);
  assert.equal(parseReviewProgress(await raw(page, REVIEW_KEY))[target.id].reviewReadyAt, 0);
});

scenario('favorites persist and word and example buttons play actual MP3 audio', {}, async ({ page }) => {
  const target = admitted[0], card = row(page, target.id);
  const original = await raw(page, REVIEW_KEY);
  await card.getByRole('button', { name: `收藏 ${target.word}`, exact: true }).click();
  assert.deepEqual((await read(page, 'codewords-favorites')).sort((a, b) => a - b), [target.id, 17].sort((a, b) => a - b));
  assert.equal(await raw(page, REVIEW_KEY), original, 'Favorite does not change review ability evidence');
  for (const type of ['word', 'example']) {
    await card.getByRole('button', { name: type === 'word' ? `朗读单词 ${target.word}` : `朗读例句 ${target.example}`, exact: true }).click();
    await page.waitForFunction(({ type, id }) => window.__reviewAudio.some(event => event.type === 'playing' && event.src.includes(`/audio/aria/${type}-${id}.mp3`) && event.duration > 0), { type, id: target.id });
  }
  const events = await page.evaluate(() => window.__reviewAudio);
  await page.reload(); await navigate(page, '复习');
  await row(page, target.id).getByRole('button', { name: `取消收藏 ${target.word}`, exact: true }).waitFor();
  await row(page, target.id).getByRole('button', { name: `取消收藏 ${target.word}`, exact: true }).click();
  assert.equal(await raw(page, 'codewords-favorites'), '[17]');
  return events;
});

scenario('scene practice opens and its draft survives the word list, overlay, themes and sections', {}, async ({ page }) => {
  await page.locator('.review-scenarios > summary').click();
  const focus = page.getByLabel('复习内容', { exact: true });
  assert.deepEqual(await focus.locator('option').allTextContents(), ['系统安排', '阅读理解', '词义', '拼写', '听力']);
  await focus.selectOption('meaning');
  await page.locator('.review-scenario-content > .daily-lessons .daily-lesson-row').first().getByRole('button', { name: '开始复习', exact: true }).click();
  await page.locator('#programming-content .daily-question').waitFor();
  assert.equal(await panel(page).count(), 0, 'Scene exercise replaces the word list rather than competing with it');
  const active = await read(page, PROGRAMMING_COURSE_KEY);
  assert.equal(active.session.mode, 'review');
  const taskId = active.session.queue[active.session.index].exerciseId;
  const task = adaptiveProgrammingLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice]).find(task => task.id === taskId);
  assert.equal(task.ability, 'meaning');
  await page.locator('.daily-question').getByRole('button', { name: task.answers[0], exact: true }).click();
  const saved = await read(page, PROGRAMMING_COURSE_KEY);
  await page.locator('.daily-session-top').getByRole('button', { name: /^〈 返回复习/ }).click();
  await panel(page).waitFor();
  await row(page, admitted[0].id).getByRole('button', { name: `练习 ${admitted[0].word}`, exact: true }).click();
  await page.locator('.lesson-overlay').waitFor(); await closeQuiz(page);
  assert.deepEqual((await read(page, PROGRAMMING_COURSE_KEY)).session, saved.session);
  await page.getByLabel('界面风格', { exact: true }).selectOption('sketch');
  await page.getByRole('button', { name: '日常英语', exact: true }).click();
  await navigate(page, '复习');
  await page.locator('#daily-content').getByRole('heading', { name: '先学习当前课程', exact: true }).waitFor();
  assert.equal(await page.locator('#daily-content .review-vocabulary').count(), 0, 'Daily review retains its own UI');
  await page.getByRole('button', { name: '编程英语', exact: true }).click();
  if (!await page.locator('#programming-content .daily-question').isVisible()) await page.locator('#programming-content .daily-resume').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('.daily-question').waitFor();
  assert.deepEqual((await read(page, PROGRAMMING_COURSE_KEY)).session, saved.session);
  await page.reload(); await navigate(page, '复习');
  if (!await page.locator('#programming-content .daily-question').isVisible()) await page.locator('#programming-content .daily-resume').getByRole('button', { name: '继续', exact: true }).click();
  await page.locator('#programming-content .daily-question').waitFor();
  assert.deepEqual((await read(page, PROGRAMMING_COURSE_KEY)).session, saved.session);
  await page.locator('.daily-controls .primary').click(); await page.locator('.daily-feedback').waitFor();
  assert.equal((await read(page, PROGRAMMING_COURSE_KEY)).session.feedback.correct, true);
  return { taskId, sourceLessonId: saved.session.lessonId };
});

scenario('empty admission pool has a usable course entry without fake mastered words', { state: {} }, async ({ page }) => {
  assert.equal(await rows(page).count(), 0);
  assert.equal(await panel(page).getByRole('button', { name: '开始到期复习', exact: true }).isDisabled(), true);
  assert.equal(await panel(page).getByRole('button', { name: '练习已学词', exact: true }).isDisabled(), true);
  await panel(page).getByRole('button', { name: '去学习当前课程', exact: true }).click();
  await page.locator('#programming-content .daily-lesson-row').getByRole('button', { name: '开始学习', exact: true }).waitFor();
});

scenario('last weak word leaves the filtered list and closing practice focuses the search box', {}, async ({ page }) => {
  const target = admitted[1];
  await page.getByLabel('复习词汇范围', { exact: true }).selectOption('weak');
  await assertList(page, [target.id]);
  await row(page, target.id).getByRole('button', { name: `练习 ${target.word}`, exact: true }).click();
  await page.locator('.lesson-overlay').waitFor();
  let answered = 0;
  while (await page.locator('.lesson-exercise').count()) { assert.ok(++answered <= 3); await answerWord(page, target); }
  await page.getByRole('heading', { name: '复习了 1 个词', exact: true }).waitFor();
  await closeQuiz(page);
  await assertList(page, []);
  assert.equal(await panel(page).getByRole('button', { name: '练习筛选结果', exact: true }).isDisabled(), true);
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '搜索已学词汇');
  assert.notEqual(await page.evaluate(() => document.activeElement?.tagName), 'BODY');
  return { wordId: target.id, answered, focusedLabel: await page.evaluate(() => document.activeElement?.getAttribute('aria-label')) };
});

scenario('shared row preserves vocabulary library count, search, favorites and actual playback', {}, async ({ page }) => {
  await navigate(page, '词汇库');
  const library = page.locator('#vocabulary-content');
  await library.waitFor({ state: 'visible' });
  assert.equal(await library.locator('.list-guide strong').innerText(), '3,620');
  assert.equal(await library.locator('article.word-card').count(), 24);
  const target = vocabulary.find(word => word.id === 3561);
  await page.getByLabel('搜索当前列表', { exact: true }).fill(target.example);
  const card = library.locator(`article.word-card[data-word-id="${target.id}"]`);
  await card.waitFor();
  assert.equal(await card.locator('.meaning').innerText(), target.meaning);
  const originalReviewRaw = await raw(page, REVIEW_KEY);
  await card.getByRole('button', { name: `收藏 ${target.word}`, exact: true }).click();
  assert.deepEqual((await read(page, 'codewords-favorites')).sort((a, b) => a - b), [17, target.id]);
  for (const type of ['word', 'example']) {
    await card.getByRole('button', { name: type === 'word' ? `朗读单词 ${target.word}` : `朗读例句 ${target.example}`, exact: true }).click();
    await page.waitForFunction(({ type, id }) => window.__reviewAudio.some(event => event.type === 'playing' && event.src.includes(`/audio/aria/${type}-${id}.mp3`) && event.duration > 0), { type, id: target.id });
  }
  await card.getByRole('button', { name: `取消收藏 ${target.word}`, exact: true }).click();
  assert.equal(await raw(page, 'codewords-favorites'), '[17]');
  assert.equal(await raw(page, REVIEW_KEY), originalReviewRaw);
  await page.getByRole('button', { name: '清除搜索', exact: true }).click();
  assert.equal(await library.locator('.list-guide strong').innerText(), '3,620');
  return { vocabularyCount: vocabulary.length, checkedWord: target.id };
});

const largeMastered = vocabulary.filter(word => !stillLearning.some(item => item.id === word.id)).slice(0, 60).map(word => word.id);
scenario('long lists load in pages and remain reachable by scrolling', { state: { ...seed, 'codewords-mastered': JSON.stringify(largeMastered) } }, async ({ page }) => {
  assert.equal(await rows(page).count(), 24);
  let pages = 1;
  while (await panel(page).getByRole('button', { name: '再显示 24 个', exact: true }).count()) {
    assert.ok(++pages <= 5);
    await panel(page).getByRole('button', { name: '再显示 24 个', exact: true }).click();
  }
  const state = parseReviewProgress(await raw(page, REVIEW_KEY));
  const expected = vocabulary.filter(word => isReviewEligible(state, word.id)).map(word => word.id);
  await assertList(page, expected);
  await rows(page).last().scrollIntoViewIfNeeded();
  assert.ok(await page.evaluate(() => scrollY) > 0);
  await noOverflow(page);
  return { pages, loadedWords: expected.length };
});

for (const width of [1440, 390, 768, 900]) scenario(`four styles at ${width}px show words in the first viewport with no horizontal overflow`, { width }, async ({ page }) => {
  const positions = [];
  for (const theme of themes) {
    await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
    await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
    await noOverflow(page);
    const first = await rows(page).first().locator('.word-button').boundingBox();
    const viewport = page.viewportSize();
    assert.ok(first && first.y >= 0 && first.y + first.height < viewport.height, `First word is not visible without scrolling in ${theme}: ${JSON.stringify(first)}`);
    positions.push({ theme, firstWordTop: first.y, firstWordBottom: first.y + first.height, viewportHeight: viewport.height });
    await page.screenshot({ path: path.join(output, `review-${theme}-${width}.png`) });
    await rows(page).last().scrollIntoViewIfNeeded(); await noOverflow(page);
    await page.locator('.review-scenarios > summary').click(); await noOverflow(page);
    await page.screenshot({ path: path.join(output, `review-scenes-${theme}-${width}.png`) });
    await page.locator('.review-scenarios > summary').click();
  }
  return positions;
});

assert.ok(scenarios.length, 'Do not claim an empty browser run');
await mkdir(output, { recursive: true });
const documentResponse = await fetch(baseURL, { signal: AbortSignal.timeout(10000) });
assert.ok(documentResponse.ok);
const html = await documentResponse.text();
const production = new URL(baseURL).pathname.startsWith('/dist/');
if (production) { assert.match(html, /\/assets\/[^"']+\.js/); assert.doesNotMatch(html, /src\/main\.tsx/); }
browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const { name, options, run } of scenarios) {
    if (process.env.CODEWORDS_SCENARIO && !process.env.CODEWORDS_SCENARIO.split('|').some(part => name.includes(part))) continue;
    let env;
    const started = Date.now();
    try {
      env = await open(options);
      const evidence = await run(env);
      assert.deepEqual(env.errors, []);
      results.push({ name, durationMs: Date.now() - started, evidence });
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error: error.stack ?? String(error) });
      console.error(`FAIL ${name}\n${error.stack ?? error}`);
      if (env) {
        const slug = name.replace(/[^a-z0-9]+/gi, '-');
        await env.page.screenshot({ path: path.join(output, `failure-${slug}.png`), fullPage: true }).catch(() => {});
        await writeFile(path.join(output, `failure-${slug}.txt`), await env.page.locator('body').innerText()).catch(() => {});
      }
    } finally {
      if (env) { browserErrors.push(...env.errors.map(error => ({ name, error }))); await env.context.close(); }
    }
  }
} finally {
  const suffix = process.env.CODEWORDS_SCENARIO ? `-${process.env.CODEWORDS_SCENARIO.replace(/[^a-z0-9]+/gi, '-').slice(0, 90)}` : '';
  await writeFile(path.join(output, `browser-results${production ? '-production' : ''}${suffix}.json`), JSON.stringify({ baseURL, production, loadedApplicationScripts: [...loadedApplicationScripts], testedAt: new Date().toISOString(), scenarios: results, failures, browserErrors, fixture: { admitted: admitted.map(word => word.id), stillLearning: stillLearning.map(word => word.id), legacyIds } }, null, 2));
  await browser.close();
}
assert.deepEqual(failures, []);
assert.deepEqual(browserErrors, []);
console.log(`PASS ${results.length} review-page scenarios.`);
