// Browser regression in disposable Chrome contexts; never opens the user profile.
// Reuse the opt-in Playwright package and running server from test-review-browser.mjs.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'playwright');
const baseURL = process.env.CODEWORDS_TEST_URL;
assert.ok(baseURL, 'Set CODEWORDS_TEST_URL to the running Vite URL.');
const source = await readFile(new URL('../src/vocabulary.ts', import.meta.url), 'utf8');
const vocabulary = JSON.parse(source.split('export const vocabulary: VocabularyItem[] = ')[1].trim().replace(/;$/, ''));
const example = vocabulary.find(word => word.id === 1).example;
const screenshotDir = process.env.CODEWORDS_QA_DIR || path.join(tmpdir(), 'codewords-compact-qa');
await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
let passed = 0;
function pass(name) { passed++; console.log(`PASS: ${name}`); }
async function open(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce', ...options });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', async dialog => { errors.push(dialog.message()); await dialog.dismiss(); });
  await page.addInitScript(() => {
    const NativeAudio = window.Audio;
    window.__cardsQA = [];
    function TrackedAudio(...args) {
      const audio = new NativeAudio(...args);
      window.__cardsQA.push(audio);
      return audio;
    }
    TrackedAudio.prototype = NativeAudio.prototype;
    Object.setPrototypeOf(TrackedAudio, NativeAudio);
    window.Audio = TrackedAudio;
  });
  await page.goto(baseURL);
  if (await page.getByRole('button', { name: '打开菜单', exact: true }).isVisible()) {
    await page.getByRole('button', { name: '打开菜单', exact: true }).click();
  }
  await page.getByRole('button', { name: '词库', exact: true }).click();
  await page.locator('.word-card').first().waitFor();
  return { page, context };
}
const audioCount = page => page.evaluate(() => window.__cardsQA.length);
async function expectAudio(page, count, file, voice = 'aria', rate = 1) {
  await page.waitForFunction(({ count }) => window.__cardsQA.length === count && window.__cardsQA.at(-1).readyState >= 2, { count });
  const audio = await page.evaluate(() => {
    const a = window.__cardsQA.at(-1);
    return { src: a.src, duration: a.duration, rate: a.playbackRate, preservesPitch: a.preservesPitch, error: a.error?.message };
  });
  const url = new URL(audio.src);
  assert.ok(url.pathname.endsWith(`/audio/${voice}/${file}`), audio.src);
  assert.equal(audio.rate, rate);
  assert.equal(audio.preservesPitch, true);
  assert.ok(audio.duration > 0 && Number.isFinite(audio.duration));
  assert.equal(audio.error, undefined);
  return url;
}
try {
  const { page, context } = await open();
  const card = page.locator('.word-card').filter({ has: page.getByRole('button', { name: '朗读单词 repository', exact: true }) });
  assert.equal(await card.locator('.slow-button, .speaker').count(), 0);
  await card.locator('.favorite').click();
  assert.equal(await audioCount(page), 0);
  assert.equal(await card.locator('.favorite').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-favorites'))), [1]);
  assert.equal(await card.locator('details').count(), 0);
  assert.equal(await card.getByText('拼写拆解', { exact: true }).count(), 0);
  pass('星标不会触发朗读，词条不再显示拼写拆解');

  await card.click({ position: { x: 5, y: 5 } });
  await expectAudio(page, 1, 'word-1.mp3');
  await card.click({ position: { x: 5, y: 5 } });
  assert.equal(await audioCount(page), 1);
  assert.equal(await page.evaluate(() => window.__cardsQA.at(-1).paused), true);
  await card.locator('.word-button').press('Enter');
  await expectAudio(page, 2, 'word-1.mp3');
  pass('卡片空白点击和键盘点读各播放一次，再点可停止');

  await card.locator('.example-zh').click();
  const exampleURL = await expectAudio(page, 3, 'example-1.mp3');
  assert.equal(exampleURL.searchParams.get('v'), example);
  await card.locator('.favorite').click();
  assert.equal(await audioCount(page), 3);
  pass('点击例句播放对应整句，版本参数与文本匹配，星标不会打断为单词音频');

  // A pointer selection is a read/copy gesture, not an implicit play action.
  await page.evaluate(() => {
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('.word-card .meaning'));
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    document.querySelector('.word-card .meaning').click();
  });
  assert.equal(await audioCount(page), 3);
  await page.evaluate(() => window.getSelection().removeAllRanges());
  pass('选择释义文字不会误触卡片朗读');

  await page.getByRole('button', { name: '语音设置', exact: true }).click();
  await page.getByLabel('点读声音', { exact: true }).selectOption('guy');
  await page.getByLabel('点读语速', { exact: true }).selectOption('slow');
  await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
  await card.locator('.word-button').click();
  await expectAudio(page, 4, 'word-1.mp3', 'guy', 0.72);
  await card.locator('.example > button').press('Space');
  await expectAudio(page, 5, 'example-1.mp3', 'guy', 0.72);
  await page.reload();
  await page.getByRole('button', { name: '词库', exact: true }).click();
  await card.locator('.word-button').click();
  await expectAudio(page, 1, 'word-1.mp3', 'guy', 0.72);
  pass('男声和慢速同时应用于单词、例句，并在刷新后保留');

  await card.locator('.known').click();
  assert.equal(await audioCount(page), 1);
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-mastered'))), [1]);
  await page.getByRole('button', { name: '已掌握', exact: true }).click();
  await card.getByRole('button', { name: '重新学习', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-mastered'))), []);
  pass('掌握与重新学习保留原记录行为且不触发音频');

  await page.getByRole('button', { name: '词库', exact: true }).click();
  for (const width of [1920, 1440, 1024, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      columns: getComputedStyle(document.querySelector('.word-grid')).gridTemplateColumns.split(' ').length,
      heights: [...document.querySelectorAll('.word-card')].slice(0, 8).map(el => el.getBoundingClientRect().height),
      unreadable: [...document.querySelectorAll('.word-card .example-en, .word-card .example-zh')].some(el => parseFloat(getComputedStyle(el).fontSize) < 14),
    }));
    assert.equal(layout.overflow, false, `${width}: horizontal overflow`);
    assert.equal(layout.columns, 1, `${width}: vocabulary remains one continuous list`);
    assert.equal(layout.unreadable, false);
    if (width === 1440) {
      await page.screenshot({ path: path.join(screenshotDir, 'desktop.png') });
    }
  }
  const longest = [...vocabulary].sort((a, b) => b.word.length - a.word.length)[0];
  await page.getByLabel('搜索当前列表', { exact: true }).fill(longest.word);
  assert.ok(await page.getByRole('button', { name: `朗读单词 ${longest.word}`, exact: true }).isVisible());
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  pass('1920/1440/1024/768/390/320 连续单列，长术语不造成横向溢出');
  await context.close();

  const mobile = await open({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const targets = await mobile.page.locator('.word-card').first().locator('.favorite, .known').evaluateAll(elements => elements.map(el => el.getBoundingClientRect().height));
  assert.ok(targets.every(height => height >= 44), String(targets));
  await mobile.page.screenshot({ path: path.join(screenshotDir, 'mobile.png') });
  await mobile.context.close();
  pass('触屏星标和掌握区域至少 44px');
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed, errors, screenshots: screenshotDir }));
} finally {
  await browser.close();
}
