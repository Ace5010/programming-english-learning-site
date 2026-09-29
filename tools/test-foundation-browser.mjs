import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { foundationTopics, FOUNDATION_KEY } from '../src/foundationCourse.ts';
import { slowReadingQueue } from '../src/slowReading.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/foundation-tutorial';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [], errors = [], audioEvents = [];
const raw = '{"version":1,"favorites":["foundation-letters"],"unrecognized":"preserve exactly"}';
async function open(width = 1440, theme = 'lagoon', record = raw) {
  const context = await browser.newContext({ viewport: { width, height: 960 }, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ theme, record, key }) => {
    if (!sessionStorage.getItem('tutorial-seeded')) {
      localStorage.setItem('codewords-section', 'foundation'); localStorage.setItem('codewords-theme', theme);
      localStorage.setItem(key, record); localStorage.setItem('codewords-favorites', '[1,2]');
      sessionStorage.setItem('tutorial-seeded', '1');
    }
    window.audioEvents = [];
    const original = HTMLMediaElement.prototype.play;
    const tracked = new WeakSet();
    HTMLMediaElement.prototype.play = function (...args) {
      if (!tracked.has(this)) {
        tracked.add(this);
        this.addEventListener('playing', () => window.audioEvents.push({ event: 'playing', src: this.src, rate: this.playbackRate }));
        this.addEventListener('ended', () => window.audioEvents.push({ event: 'ended', src: this.src, rate: this.playbackRate }));
        this.addEventListener('error', () => window.audioEvents.push({ event: 'error', src: this.src }));
      }
      return original.apply(this, args);
    };
  }, { theme, record, key: FOUNDATION_KEY });
  await page.goto(baseURL); await page.locator('#foundation-content h1').waitFor();
  return { page, context };
}
const nav = async (page, name) => {
  await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click();
  // The chart now leads pronunciation. These cases exercise the retained tutorials.
  if (name === '音标与发音' && await page.locator('.phonemic-tutorials').getAttribute('open') === null) await page.locator('.phonemic-tutorials > summary').click();
};
const section = (page, name) => page.getByRole('group', { name: '学习分区', exact: true }).getByRole('button', { name, exact: true }).click();
async function scenario(name, run) { try { await run(); results.push(name); console.log(`PASS ${name}`); } catch (error) { failures.push({ name, error: error.stack }); console.error(`FAIL ${name}: ${error.message}`); } }
try {
  await scenario('independent tutorials, optional interaction, every visible topic reachable and records untouched', async () => {
    const { page, context } = await open();
    assert.deepEqual(await page.getByRole('navigation', { name: '学习导航' }).getByRole('button').allTextContents(), ['基础概念与语法', '音标与发音']);
    await page.getByRole('heading', { name: '名词和主语有什么区别', exact: true }).waitFor();
    await page.getByRole('button', { name: '是，名词就是主语', exact: true }).click();
    await page.getByRole('status').filter({ hasText: '再看谁在读' }).waitFor();
    await page.getByRole('combobox', { name: '界面配色' }).selectOption('pearl');
    assert.equal(await page.getByRole('button', { name: '是，名词就是主语', exact: true }).getAttribute('aria-pressed'), 'true');
    await page.getByRole('navigation', { name: '章节翻页' }).getByRole('button', { name: /^接下来/ }).click();
    await page.getByRole('heading', { name: '句子语序：谁、做什么、对什么', exact: true }).waitFor();
    for (const sound of [false, true]) {
      await nav(page, sound ? '音标与发音' : '基础概念与语法');
      const topics = foundationTopics.filter(topic => !topic.hidden && topic.sound === sound);
      assert.equal(await page.locator('.tutorial-directory li').count(), topics.length + (sound ? 0 : 1));
      for (let i = 0; i < topics.length + (sound ? 0 : 1); i++) {
        await page.locator('.tutorial-directory li button').nth(i).click();
        assert.equal(await page.locator('.foundation-card:visible').count(), 1);
      }
    }
    assert.equal(await page.locator('#foundation-content .daily-expression-star, #foundation-content .daily-question').count(), 0);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), FOUNDATION_KEY), raw);
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-favorites')), '[1,2]');
    await page.reload(); assert.equal(await page.evaluate(key => localStorage.getItem(key), FOUNDATION_KEY), raw);
    await context.close();
  });
  await scenario('sound sample actions, normal and slow real audio in both voices, no phoneme masquerading as TTS', async () => {
    const { page, context } = await open(); await nav(page, '音标与发音');
    await page.getByRole('button', { name: '查看 /v/ 发音说明', exact: true }).click();
    assert.match(await page.locator('.tutorial-action').textContent(), /声带振动/);
    assert.match(await page.getByRole('link', { name: /观看 BBC/ }).getAttribute('href'), /vE12RFyH-hY/);
    for (const voice of ['aria', 'guy']) {
      await page.getByRole('button', { name: '选择声音', exact: true }).click();
      await page.getByRole('combobox', { name: '点读声音', exact: true }).selectOption(voice);
      await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
      for (const slow of [false, true]) {
        await page.evaluate(() => { window.audioEvents = []; });
        await page.getByRole('button', { name: `${slow ? '慢速朗读' : '朗读'} fan`, exact: true }).click();
        await page.waitForFunction(() => window.audioEvents.some(event => event.event === 'ended'));
        const events = await page.evaluate(() => window.audioEvents); audioEvents.push(...events);
        assert.ok(events.some(event => event.event === 'playing' && event.src.includes(`/foundation/${voice}/`) && event.rate === (slow ? .72 : 1)));
        assert.ok(!events.some(event => event.event === 'error'));
      }
    }
    await context.close();
  });
  await scenario('new noun role examples play in both voices and sample identity differs from word order', async () => {
    const { page, context } = await open();
    assert.equal(await page.locator('#foundation-content .foundation-card').getAttribute('data-topic'), 'foundation-noun-roles');
    for (const voice of ['aria', 'guy']) {
      await page.getByRole('button', { name: '选择声音', exact: true }).click();
      await page.getByRole('combobox', { name: '点读声音', exact: true }).selectOption(voice);
      await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
      for (const text of ['The dog sees me.', 'I see the dog.']) for (const slow of [false, true]) {
        await page.evaluate(() => { window.audioEvents = []; });
        await page.getByRole('button', { name: `${slow ? '慢速朗读' : '朗读'} ${text}`, exact: true }).click();
        if (slow) {
          await page.waitForFunction(() => window.audioEvents.some(event => event.event === 'playing'));
          await page.waitForFunction(text => document.querySelector(`button[aria-label="慢速朗读 ${CSS.escape(text)}"]`)?.getAttribute('aria-pressed') === 'false', text);
        } else await page.waitForFunction(() => window.audioEvents.some(event => event.event === 'ended'));
        const events = await page.evaluate(() => window.audioEvents); audioEvents.push(...events);
        if (slow) {
          const queue = slowReadingQueue(text, voice, baseURL);
          assert.deepEqual(events.filter(event => event.event === 'playing').map(event => event.src), queue.map(clip => clip.url));
          assert.ok(events.filter(event => event.event === 'playing').every(event => event.rate === .72));
        } else assert.ok(events.some(event => event.event === 'playing' && event.src.includes(`/foundation/${voice}/`) && event.rate === 1));
      }
    }
    await context.close();
  });
  await scenario('embedded player is opt-in and removed when leaving pronunciation or reading a word', async () => {
    const { page, context } = await open(); await nav(page, '音标与发音');
    assert.equal(await page.locator('.tutorial-video iframe').count(), 0);
    await page.getByRole('button', { name: '加载页内示范', exact: true }).click();
    assert.match(await page.locator('.tutorial-video iframe').getAttribute('src'), /youtube.com\/embed\/vE12RFyH-hY/);
    await page.getByRole('button', { name: '朗读 fan', exact: true }).click();
    await page.waitForFunction(() => !document.querySelector('.tutorial-video iframe'));
    await page.getByRole('button', { name: '加载页内示范', exact: true }).click();
    await section(page, '日常英语');
    await page.waitForFunction(() => !document.querySelector('.tutorial-video iframe'));
    await context.close();
  });
  await scenario('original course can open foundation explanation then return to unchanged draft', async () => {
    const { page, context } = await open(); await section(page, '日常英语');
    await page.locator('#daily-content').getByRole('button', { name: '开始学习', exact: true }).click();
    const before = await page.evaluate(() => localStorage.getItem('codewords-daily-v1'));
    assert.equal(await page.locator('#daily-content .foundation-help summary').count(), 0);
    await page.locator('#daily-content .foundation-guide-link').first().waitFor({ state: 'visible' });
    await page.locator('#daily-content .foundation-guide-link').first().click();
    await page.getByRole('heading', { name: '单词、词组和句子有什么区别', exact: true }).waitFor();
    assert.equal(await page.locator('#foundation-content .foundation-card').getAttribute('data-topic'), 'foundation-word-concepts');
    await page.getByRole('button', { name: '返回日常英语', exact: true }).click();
    assert.equal(await page.evaluate(() => localStorage.getItem('codewords-daily-v1')), before);
    await context.close();
  });
  for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) for (const width of [1440, 390, 320]) await scenario(`${theme} ${width}px: both samples, readable meanings, reachable controls`, async () => {
    const { page, context } = await open(width, theme);
    for (const [track, name] of [['grammar', '基础概念与语法'], ['sounds', '音标与发音']]) {
      await nav(page, name);
      const report = await page.evaluate(() => {
        const meaning = document.querySelector('#foundation-content .foundation-meaning');
        return { scroll: document.documentElement.scrollWidth, font: getComputedStyle(meaning).fontSize, weight: getComputedStyle(meaning).fontWeight,
          outside: [...document.querySelectorAll('.site-header button, #foundation-content button, #foundation-content input')].filter(el => el.getBoundingClientRect().height && !el.closest('[hidden]')).filter(el => { const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1; }).map(el => el.textContent) };
      });
      assert.ok(report.scroll <= width + 1, JSON.stringify(report)); assert.deepEqual(report.outside, []);
      assert.ok(parseFloat(report.font) >= 20); assert.ok(Number(report.weight) >= 700);
      if (width !== 320) await page.screenshot({ path: `${output}/${track}-${theme}-${width}.png`, fullPage: true });
    }
    await context.close();
  });
  await scenario('corrupt historical data does not block tutorial and remains byte-for-byte unchanged', async () => {
    const { page, context } = await open(390, 'lagoon', '{broken');
    await nav(page, '音标与发音');
    await page.getByRole('button', { name: '保持齿唇位置，加入声带振动', exact: true }).click();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), FOUNDATION_KEY), '{broken'); await context.close();
  });
} finally {
  await browser.close(); await writeFile(`${output}/browser-results.json`, JSON.stringify({ results, failures, errors, audioEvents }, null, 2));
}
if (failures.length || errors.length) process.exitCode = 1;
