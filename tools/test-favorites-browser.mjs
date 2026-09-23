// Exercise real collection pages in disposable Chrome contexts; never use a user profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vocabulary } from '../src/vocabulary.ts';
import { dailyPhrases } from '../src/dailyCourse.ts';
import { DAILY_KEY } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { REVIEW_KEY } from '../src/review.ts';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve('artifacts/favorites');
const earned = JSON.parse(await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8'));
const word = vocabulary[0], secondWord = vocabulary[1], phrase = dailyPhrases[0], secondPhrase = dailyPhrases[1];
const favoriteKey = 'codewords-favorites';
const seed = {
  [favoriteKey]: JSON.stringify([word.id, secondWord.id, 999999]),
  [DAILY_KEY]: JSON.stringify({ ...JSON.parse(earned.daily.course), favorites: [phrase.id, secondPhrase.id, 'historical-expression'] }),
  [PROGRAMMING_COURSE_KEY]: earned.programming.course,
  [REVIEW_KEY]: earned.programming.review,
};
const scenarios = [], results = [], failures = [], audioEvidence = [], scripts = new Set();
const raw = (page, key) => page.evaluate(key => localStorage.getItem(key), key);
const read = async (page, key) => JSON.parse(await raw(page, key));
const nav = page => page.getByRole('navigation', { name: '学习导航' });
const go = (page, label) => nav(page).getByRole('button', { name: label, exact: true }).click();
const section = (page, label) => page.getByRole('group', { name: '学习分区' }).getByRole('button', { name: label, exact: true }).click();
const words = page => page.locator('#vocabulary-content');
const daily = page => page.locator('#daily-content');
const scenario = (name, options, run) => scenarios.push({ name, options, run });
let browser;
async function open({ state = seed, width = 1440 } = {}) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 844 : 1000 }, hasTouch: width < 600, reducedMotion: 'reduce' });
  const page = await context.newPage(), errors = [];
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('favicon.ico')) errors.push(event.text()); });
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(state => {
    if (!sessionStorage.getItem('favorites-qa')) {
      for (const [key, value] of Object.entries(state)) localStorage.setItem(key, value);
      sessionStorage.setItem('favorites-qa', '1');
    }
    const NativeAudio = window.Audio;
    window.__favoriteAudio = [];
    function Audio(...args) {
      const audio = new NativeAudio(...args);
      audio.addEventListener('playing', () => window.__favoriteAudio.push({ src: audio.src, rate: audio.playbackRate, duration: audio.duration, preservesPitch: audio.preservesPitch }));
      return audio;
    }
    Audio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(Audio, NativeAudio);
    window.Audio = Audio;
  }, state);
  await page.goto(baseURL);
  await nav(page).waitFor();
  const loaded = await page.evaluate(() => [...document.scripts].map(script => script.src).filter(src => /\/assets\/[^/]+\.js/.test(src)));
  for (const src of loaded) scripts.add(src);
  if (process.env.CODEWORDS_EXPECTED_BUNDLE) assert.ok(loaded.some(src => src.endsWith(process.env.CODEWORDS_EXPECTED_BUNDLE)));
  return { page, context, errors };
}
async function play(page, button, rate, file) {
  const start = await page.evaluate(() => window.__favoriteAudio.length);
  await button.click();
  await page.waitForFunction(({ start, rate, file }) => window.__favoriteAudio.slice(start).some(item => item.rate === rate && item.src.includes(file) && item.duration > 0), { start, rate, file });
  const item = await page.evaluate(() => window.__favoriteAudio.at(-1));
  assert.equal(item.preservesPitch, true);
  audioEvidence.push(item);
}
async function noOverflow(page) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  assert.ok(size.document <= size.viewport + 1, JSON.stringify(size));
}

scenario('saved word favorites are visible independently of library filters', {}, async ({ page }) => {
  await go(page, '词汇库');
  await words(page).getByLabel('搜索当前列表').fill('no-such-word-filter');
  await words(page).getByLabel('词汇分类').selectOption(vocabulary.find(item => item.category !== word.category).category);
  await go(page, '收藏');
  assert.equal(await nav(page).getByRole('button', { name: '收藏', exact: true }).getAttribute('aria-current'), 'page');
  await words(page).getByRole('heading', { name: '收藏的单词', exact: true }).waitFor();
  assert.equal(await words(page).locator('article[data-word-id]').count(), 2);
  const reviewBefore = await raw(page, REVIEW_KEY), courseBefore = await raw(page, PROGRAMMING_COURSE_KEY), dailyBefore = await raw(page, DAILY_KEY);
  const card = words(page).locator(`[data-word-id="${word.id}"]`);
  await play(page, card.getByRole('button', { name: `朗读单词 ${word.word}`, exact: true }), 1, `/word-${word.id}.mp3`);
  await play(page, card.getByRole('button', { name: `慢速朗读单词 ${word.word}`, exact: true }), .72, `/word-${word.id}.mp3`);
  await play(page, card.getByRole('button', { name: `朗读例句 ${word.example}`, exact: true }), 1, `/example-${word.id}.mp3`);
  await play(page, card.getByRole('button', { name: `慢速朗读例句 ${word.example}`, exact: true }), .72, `/example-${word.id}.mp3`);
  await words(page).getByLabel('搜索当前列表').fill(word.word);
  assert.equal(await card.count(), 1);
  await words(page).getByLabel('搜索当前列表').fill('unmatched favorite');
  await words(page).getByRole('button', { name: '查看全部收藏', exact: true }).click();
  assert.equal(await words(page).locator('article[data-word-id]').count(), 2);
  await card.getByRole('button', { name: `取消收藏 ${word.word}`, exact: true }).click();
  assert.equal(await card.count(), 0);
  assert.deepEqual(await read(page, favoriteKey), [secondWord.id, 999999]);
  await words(page).getByRole('button', { name: `取消收藏 ${secondWord.word}`, exact: true }).click();
  await words(page).getByRole('heading', { name: '还没有收藏单词', exact: true }).waitFor();
  assert.deepEqual(await read(page, favoriteKey), [999999]);
  assert.equal(await raw(page, REVIEW_KEY), reviewBefore);
  assert.equal(await raw(page, PROGRAMMING_COURSE_KEY), courseBefore);
  assert.equal(await raw(page, DAILY_KEY), dailyBefore);
  await words(page).getByRole('button', { name: '去词汇库收藏', exact: true }).click();
  assert.equal(await words(page).getByLabel('搜索当前列表').inputValue(), 'no-such-word-filter');
  await words(page).getByRole('button', { name: '查看全部词汇', exact: true }).click();
  await words(page).getByRole('button', { name: `收藏 ${word.word}`, exact: true }).click();
  await page.reload(); await go(page, '收藏');
  assert.equal(await words(page).locator(`[data-word-id="${word.id}"]`).count(), 1);
  assert.deepEqual(await read(page, favoriteKey), [999999, word.id]);
});

scenario('saved expression favorites preserve learning records and survive refresh', {}, async ({ page }) => {
  await section(page, '日常英语'); await go(page, '表达库');
  await daily(page).getByLabel('查找表达').fill('no-such-expression-filter');
  await daily(page).getByLabel('显示内容').selectOption('learned');
  await go(page, '收藏');
  await daily(page).getByRole('heading', { name: '收藏的表达', exact: true }).waitFor();
  assert.equal(await daily(page).locator('.daily-expression').count(), 2);
  const before = await read(page, DAILY_KEY), programmingBefore = await raw(page, PROGRAMMING_COURSE_KEY), wordFavorites = await raw(page, favoriteKey);
  await play(page, daily(page).getByRole('button', { name: `朗读 ${phrase.en}`, exact: true }), 1, `/audio/daily/aria/${phrase.id}.mp3`);
  await play(page, daily(page).getByRole('button', { name: `慢速朗读 ${phrase.en}`, exact: true }), .72, `/audio/daily/aria/${phrase.id}.mp3`);
  await daily(page).getByLabel('查找表达').fill('unmatched favorite');
  await daily(page).getByRole('button', { name: '查看全部收藏', exact: true }).click();
  assert.equal(await daily(page).locator('.daily-expression').count(), 2);
  await daily(page).getByRole('button', { name: `取消收藏 ${phrase.en}`, exact: true }).click();
  await daily(page).getByRole('button', { name: `取消收藏 ${secondPhrase.en}`, exact: true }).click();
  await daily(page).getByRole('heading', { name: '还没有收藏表达', exact: true }).waitFor();
  const after = await read(page, DAILY_KEY);
  assert.deepEqual(after.favorites, ['historical-expression']);
  const { revision: oldRevision, favorites: oldFavorites, ...oldEvidence } = before;
  const { revision: newRevision, favorites: newFavorites, ...newEvidence } = after;
  assert.deepEqual(newEvidence, oldEvidence);
  assert.equal(await raw(page, PROGRAMMING_COURSE_KEY), programmingBefore);
  assert.equal(await raw(page, favoriteKey), wordFavorites);
  await daily(page).getByRole('button', { name: '去表达库收藏', exact: true }).click();
  assert.equal(await daily(page).getByLabel('查找表达').inputValue(), 'no-such-expression-filter');
  await daily(page).getByLabel('查找表达').fill(''); await daily(page).getByLabel('显示内容').selectOption('all');
  await daily(page).getByRole('button', { name: `收藏 ${phrase.en}`, exact: true }).click();
  await page.reload(); await go(page, '收藏');
  assert.equal(await daily(page).locator('.daily-expression').count(), 1);
  assert.deepEqual((await read(page, DAILY_KEY)).favorites, ['historical-expression', phrase.id]);
});

for (const name of ['编程英语', '日常英语']) scenario(`${name} course draft survives a visit to favorites`, { state: {} }, async ({ page }) => {
  await section(page, name);
  const scope = page.locator(name === '日常英语' ? '#daily-content' : '#programming-content');
  const key = name === '日常英语' ? DAILY_KEY : PROGRAMMING_COURSE_KEY;
  await scope.locator('.daily-lesson-row').getByRole('button').click();
  await scope.locator('.daily-study-card').getByRole('button', { name: '开始练习', exact: true }).click();
  await scope.locator('.daily-question .daily-option').first().click();
  const before = (await read(page, key)).session;
  assert.ok(before.draft.choice);
  await go(page, '收藏');
  assert.equal(await scope.locator('.daily-question:visible').count(), 0);
  await go(page, '课程');
  // Re-activating programming resumes immediately; the daily page keeps its explicit resume entry.
  if (!await scope.locator('.daily-question').isVisible()) await scope.locator('.daily-resume').getByRole('button', { name: '继续', exact: true }).click();
  assert.deepEqual((await read(page, key)).session, before);
  assert.equal(await scope.locator('.daily-question').getByRole('button', { name: before.draft.choice, exact: true }).getAttribute('aria-pressed'), 'true');
});

scenario('favorites pagination exposes every saved word and damaged records remain intact', { state: { ...seed, [favoriteKey]: JSON.stringify(vocabulary.slice(0, 26).map(item => item.id)) } }, async ({ page }) => {
  await go(page, '收藏');
  assert.equal(await words(page).locator('article[data-word-id]').count(), 24);
  await words(page).getByRole('button', { name: '再显示 24 个', exact: true }).click();
  assert.equal(await words(page).locator('article[data-word-id]').count(), 26);
  const damaged = '{broken collection';
  await page.evaluate(({ key, value }) => localStorage.setItem(key, value), { key: favoriteKey, value: damaged });
  await page.reload(); await go(page, '收藏');
  await words(page).getByRole('alert').filter({ hasText: '收藏记录无法读取' }).waitFor();
  assert.equal(await raw(page, favoriteKey), damaged);
  await go(page, '词汇库');
  assert.equal(await words(page).getByRole('button', { name: `收藏 ${word.word}`, exact: true }).isDisabled(), true);
});

for (const width of [1440, 390, 320]) scenario(`favorites navigation and local controls fit all themes at ${width}px`, { width }, async ({ page }) => {
  for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
    await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
    for (const [name, scope] of [['编程英语', words(page)], ['日常英语', daily(page)]]) {
      await section(page, name); await go(page, '收藏');
      await scope.locator('h1').waitFor();
      await noOverflow(page);
      const button = nav(page).getByRole('button', { name: '收藏', exact: true });
      const box = await button.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1 && box.y >= 0 && box.y + box.height <= 250);
      assert.equal(await scope.locator('.daily-question:visible').count(), 0);
      assert.equal(await scope.locator('button button').count(), 0);
      const slow = scope.getByRole('button', { name: name === '编程英语' ? `慢速朗读单词 ${word.word}` : `慢速朗读 ${phrase.en}`, exact: true });
      await slow.scrollIntoViewIfNeeded();
      const local = await slow.boundingBox();
      assert.ok(local && local.x >= 0 && local.x + local.width <= width + 1);
      await page.screenshot({ path: path.join(output, `${name === '编程英语' ? 'words' : 'expressions'}-${theme}-${width}.png`) });
    }
  }
});

await mkdir(output, { recursive: true });
browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const { name, options, run } of scenarios) {
    if (process.env.CODEWORDS_SCENARIO && !process.env.CODEWORDS_SCENARIO.split('|').some(part => name.includes(part))) continue;
    let env;
    try {
      env = await open(options); await run(env); assert.deepEqual(env.errors, []);
      results.push(name); console.log(`PASS ${name}`);
    } catch (error) {
      failures.push({ name, error: error.stack ?? String(error) }); console.error(`FAIL ${name}\n${error.stack ?? error}`);
      if (env) {
        const slug = name.replace(/[^a-z0-9]+/gi, '-');
        await env.page.screenshot({ path: path.join(output, `failure-${slug}.png`), fullPage: true }).catch(() => {});
        await writeFile(path.join(output, `failure-${slug}.txt`), await env.page.locator('body').innerText());
      }
    } finally { await env?.context.close(); }
  }
} finally {
  await writeFile(path.join(output, `results${new URL(baseURL).pathname.startsWith('/dist/') ? '-production' : ''}.json`), JSON.stringify({ baseURL, scripts: [...scripts], results, failures, audioEvidence }, null, 2));
  await browser.close();
}
assert.deepEqual(failures, []);
console.log(`PASS ${results.length} favorites scenarios, ${audioEvidence.length} actual playing events.`);
