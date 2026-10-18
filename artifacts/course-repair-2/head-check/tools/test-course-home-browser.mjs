import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { DAILY_KEY, parseDailyProgress } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { courseOverview } from '../src/courseOverviewData.ts';
import { resolveAdaptiveLesson } from '../src/adaptiveLearning.ts';
import { courseFixture } from './helpers/course-home-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = 'artifacts/palette-rollout/course-home';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], errors = [];
const keys = [DAILY_KEY, PROGRAMMING_COURSE_KEY, 'codewords-review-v1', 'codewords-mastered', 'codewords-foundation-v1'];
const snapshot = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), keys);
try {
  for (const [section, key, lessons] of [['daily', DAILY_KEY, adaptiveDailyLessons], ['programming', PROGRAMMING_COURSE_KEY, adaptiveProgrammingLessons]]) {
    for (const kind of ['fresh', 'mixed', 'weak', 'saved', 'legacy', 'review']) {
      const progress = courseFixture(lessons, kind), overview = courseOverview(progress, lessons);
      assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, true);
      const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, reducedMotion: 'reduce' });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(({ section, key, progress }) => {
        if (sessionStorage.getItem('course-home-test')) return;
        sessionStorage.setItem('course-home-test', '1');
        localStorage.setItem('codewords-section', section);
        localStorage.setItem('codewords-theme', 'lagoon');
        localStorage.setItem(key, JSON.stringify(progress));
      }, { section, key, progress });
      await page.goto(baseURL);
      const main = page.locator(`#${section}-content`);
      await main.waitFor({ state: 'visible' });
      const goHome = () => page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '课程', exact: true }).click();
      await goHome();
      const baseline = await snapshot(page);
      const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
      if (!overview) {
        await main.getByRole('heading', { name: '下一轮待安排' }).waitFor();
        assert.equal(await main.locator('.course-current').count(), 0);
      } else {
        const heading = main.locator('.course-current h3');
        assert.equal(await heading.textContent(), `第 ${overview.round} 节 · ${overview.title}`);
        assert.deepEqual(await main.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId)), overview.targets.slice(0, 4).map(item => item.id));
        assert.equal(await main.locator('.course-arrangement,.course-goal').count(), 0);
        const themes = ['fresh', 'saved'].includes(kind) ? ['lagoon', 'pearl', 'sky', 'mint'] : ['lagoon'];
        for (const theme of themes) {
          await page.locator('.theme-picker select').selectOption(theme);
          assert.deepEqual(await snapshot(page), baseline, `${section}/${kind}/${theme}: theme wrote learning data`);
          for (const width of ['fresh', 'saved'].includes(kind) ? [1440, 768, 390, 320] : [1440]) {
            await page.setViewportSize({ width, height: width === 1440 ? 1100 : 844 });
            const geometry = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }));
            assert.ok(geometry.width <= geometry.viewport + 1, `${section}/${kind}/${theme}/${width}: overflow`);
            if (width === 1440) {
              const left = await main.locator('.course-home-main').boundingBox(), right = await main.locator('.daily-rail').boundingBox();
              assert.ok(left.width > right.width * 1.5 && right.x > left.x + left.width);
            }
            if (kind === 'fresh' && [1440, 390].includes(width)) await page.screenshot({ path: `${output}/${section}-${theme}-${width}.png`, fullPage: true });
          }
        }
        await page.reload(); await goHome();
        assert.deepEqual(await snapshot(page), baseline, `${section}/${kind}: refresh changed progress`);
        assert.equal(await heading.textContent(), `第 ${overview.round} 节 · ${overview.title}`);
        await main.locator('.course-start button').click();
        await main.locator('.daily-session').waitFor();
        const started = await stored();
        if (overview.resume) assert.deepEqual(started, JSON.parse(baseline[key]), `${section}/${kind}: resume overwrote session`);
        else {
          assert.deepEqual(started.session.adaptive.focusIds, overview.targets.map(item => item.id));
          assert.equal(started.session.answers.length, 0);
          assert.deepEqual(started.learning, progress.learning);
          assert.deepEqual(await main.locator('.daily-phrase-content strong').allTextContents(), resolveAdaptiveLesson(started.session, lessons).phrases.map(phrase => phrase.en));
        }
        if (kind === 'saved') {
          const input = main.locator('.daily-fill input, .daily-write').first();
          assert.equal(await input.inputValue(), 'unfinished answer');
          await input.fill('kept after reload');
        }
        const activeSnapshot = await snapshot(page);
        await page.locator('.theme-picker select').selectOption('pearl');
        await page.reload();
        await main.locator('.daily-session').waitFor();
        assert.deepEqual(await snapshot(page), activeSnapshot, `${section}/${kind}: resumed refresh changed queue/draft`);
        if (kind === 'saved') assert.equal(await main.locator('.daily-fill input, .daily-write').first().inputValue(), 'kept after reload');
        const after = await snapshot(page);
        for (const otherKey of keys.filter(other => other !== key && !(section === 'programming' && other === 'codewords-review-v1'))) assert.equal(after[otherKey], baseline[otherKey], `${section}: changed ${otherKey}`);
      }
      assert.deepEqual(errors, []);
      results.push({ section, kind, passed: true });
      console.log(`PASS ${section}/${kind}`);
      await context.close();
    }
  }
} finally {
  await writeFile(`${output}/results.json`, JSON.stringify({ results, errors }, null, 2));
  await browser.close();
}
