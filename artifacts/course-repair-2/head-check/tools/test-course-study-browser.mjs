import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons as daily } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons as programming } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession, DAILY_KEY } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { sentenceGuide } from '../src/sentenceGuide.ts';
import { slowReadingQueue } from '../src/slowReading.ts';
import { findReadingAudio } from '../src/readingAudio.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(url, /^http:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = 'artifacts/course-study-guide';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
try {
  for (const [section, source, focus] of [
    ['programming', programming[1], ['word-1', 'word-3561', 'word-4', 'word-7']],
    ['daily', daily[0], null],
    ['daily', daily.find(item => item.phrases.some(phrase => phrase.id === 'daily-word-student')), ['daily-word-student']],
    ['daily', daily.find(item => item.phrases.some(phrase => phrase.id === 'objects-together')), ['objects-together']],
  ]) {
    const key = section === 'daily' ? DAILY_KEY : PROGRAMMING_COURSE_KEY;
    const progress = createDailyProgress();
    progress.session = { ...createDailySession(source, 'lesson'), ...(focus ? { adaptive: { version: 1, round: 2, focusIds: focus, newIds: focus.includes('word-4') ? ['word-4'] : focus, sourceLessonId: source.id, seed: 5, budget: 8 } } : {}) };
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(({ key, section, progress }) => {
      localStorage.setItem('codewords-section', section);
      localStorage.setItem(key, JSON.stringify(progress));
      window.guideAudio = [];
      const original = HTMLMediaElement.prototype.play;
      const tracked = new WeakSet();
      HTMLMediaElement.prototype.play = function (...args) {
        if (!tracked.has(this)) {
          tracked.add(this);
          this.addEventListener('playing', () => window.guideAudio.push({ src: this.src, rate: this.playbackRate }));
        }
        return original.apply(this, args);
      };
    }, { key, section, progress });
    await page.goto(url);
    const root = page.locator(`#${section}-content`);
    await root.locator('.foundation-help').waitFor();
    const baseline = await page.evaluate(key => localStorage.getItem(key), key);
    assert.doesNotMatch(await root.locator('h1').textContent(), /^第\s*\d+\s*节$/);
    assert.ok(await root.locator('.daily-study-intro').isVisible());
    assert.equal(await root.locator('.foundation-help summary, .daily-play-hint, .daily-study-explanation').count(), 0);
    const guideId = await root.locator('.foundation-help').getAttribute('data-guide-phrase');
    const phrase = [...programming, ...daily].flatMap(item => item.phrases).find(item => item.id === guideId);
    assert.deepEqual(await root.locator('.foundation-guide-parts dt').allTextContents(), sentenceGuide(phrase).parts.map(part => part.text));
    if (section === 'programming') assert.equal(guideId, 'example-4', 'explain this round’s new word, not an unrelated review example');
    for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
      await page.getByLabel('界面配色', { exact: true }).selectOption(theme);
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        const geometry = await root.evaluate(root => {
          const visible = e => e.getBoundingClientRect().width > 0;
          const clipped = [...root.querySelectorAll('.daily-phrase, .foundation-guide-parts > div')].flatMap(card => {
            const a = card.getBoundingClientRect();
            return [...card.querySelectorAll('.daily-meaning, .daily-phrase-content, .daily-inline-slow, dt, dd')].filter(visible).filter(e => {
              const b = e.getBoundingClientRect();
              return b.left < a.left - 1 || b.right > a.right + 1 || b.bottom > a.bottom + 1;
            }).map(e => e.textContent);
          });
          return { width: innerWidth, pageWidth: document.documentElement.scrollWidth, clipped };
        });
        assert.ok(geometry.pageWidth <= width + 1, JSON.stringify(geometry));
        assert.deepEqual(geometry.clipped, [], `${section}/${source.id}/${theme}/${width}`);
        const pair = root.locator('.daily-study-pair').first();
        if (await pair.count() && await pair.locator('.daily-study-cell').count() === 2) {
          const [word, example] = await pair.locator('.daily-study-cell').evaluateAll(items => items.map(e => e.getBoundingClientRect().toJSON()));
          assert.ok(width <= 600 ? example.y >= word.bottom - 1 : Math.abs(example.y - word.y) < 1);
        }
        if (theme === 'lagoon' && [1440, 390].includes(width)) await page.screenshot({ path: `${output}/${section}-${source.id}-${width}.png`, fullPage: true });
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), baseline);
        results.push(`${section}/${source.id}/${theme}/${width}`);
      }
    }
    if (section === 'programming' || focus?.includes('daily-word-student')) {
      for (const voice of ['aria', 'guy']) {
        await root.getByRole('button', { name: '语音设置', exact: true }).click();
        await page.getByRole('combobox', { name: '点读声音', exact: true }).selectOption(voice);
        await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
        for (const slow of [false, true]) {
          await page.evaluate(() => { window.guideAudio = []; });
          const control = root.getByRole('button', { name: `${slow ? '慢速朗读' : '朗读'}讲解例句 ${phrase.en}`, exact: true });
          await control.click();
          await page.waitForFunction(() => window.guideAudio.length > 0);
          await page.waitForFunction(label => document.querySelector(`[aria-label="${label}"]`)?.getAttribute('aria-pressed') === 'false', `${slow ? '慢速朗读' : '朗读'}讲解例句 ${phrase.en}`);
          const events = await page.evaluate(() => window.guideAudio);
          const expected = slow ? slowReadingQueue(phrase.en, voice, url).map(item => item.url) : [new URL(`audio/${findReadingAudio(phrase.en).path.replace('{voice}', voice)}`, url).href];
          assert.deepEqual(events.map(event => new URL(event.src).pathname), expected.map(src => new URL(src).pathname));
          assert.ok(events.every(event => event.rate === (slow ? .72 : 1)));
          assert.equal(await page.evaluate(key => localStorage.getItem(key), key), baseline);
        }
      }
    }
    await root.locator('.foundation-guide-link').click();
    await page.locator('#foundation-content').waitFor({ state: 'visible' });
    await page.getByRole('button', { name: `返回${section === 'daily' ? '日常英语' : '编程英语'}`, exact: true }).click();
    await root.locator('.daily-study-card').waitFor();
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), baseline);
    await root.getByRole('button', { name: '开始练习', exact: true }).click();
    await root.locator('.daily-question').waitFor();
    await context.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
}
console.log(`PASS ${results.length} study layouts; explanations, return and exercise transition verified.`);
