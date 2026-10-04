// Isolated profiles and existing local audio; no user storage or microphone.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { createDailyProgress, parseDailyProgress } from '../src/dailyProgress.ts';
import { planAdaptiveSession, skipAdaptiveCourse, hasAdaptiveContent } from '../src/adaptiveLearning.ts';
import { courseOverview } from '../src/courseOverviewData.ts';
import { courseFixture } from './helpers/course-home-fixture.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/daily-course-scope/browser';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-proxy-server'] });
const key = 'codewords-daily-v1', skipLabel = '这些我都会，跳过本课';
const report = { url, input: 'isolated learning fixtures; real UI and local audio', scenarios: [], errors: [], audio: [] };
const otherKeys = ['codewords-programming-course-v1', 'codewords-mastered', 'codewords-favorites', 'codewords-review-v1', 'codewords-foundation-v1'];

function sixTargetFixture() {
  let progress = createDailyProgress();
  for (let n = 0; n < 100; n++) {
    if (courseOverview(progress, lessons)?.targets.length === 6) return progress;
    const session = planAdaptiveSession(progress, lessons, 1700000000000 + n, () => .37);
    assert.ok(session);
    progress = skipAdaptiveCourse({ ...progress, session }, lessons, 1700000001000 + n, () => .37);
  }
  throw new Error('No real six-target scope found');
}

async function scenario(name, progress, width, theme, run) {
  const context = await browser.newContext({ viewport: { width, height: width < 600 ? 900 : 1100 }, reducedMotion: 'reduce' });
  await context.route('http://127.0.0.1:18768/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(({ key, progress, theme }) => {
    if (!sessionStorage.getItem('daily-scope-seeded')) {
      sessionStorage.setItem('daily-scope-seeded', '1');
      localStorage.setItem('codewords-section', 'daily'); localStorage.setItem('codewords-theme', theme);
      localStorage.setItem(key, typeof progress === 'string' ? progress : JSON.stringify(progress));
      localStorage.setItem('codewords-programming-course-v1', '{"version":1,"revision":0,"lessons":{},"session":null}');
      localStorage.setItem('codewords-mastered', '[1,2]'); localStorage.setItem('codewords-favorites', '[3]');
    }
    window.scopeAudio = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      this.addEventListener('ended', () => window.scopeAudio.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch }), { once: true });
      return play.apply(this, args);
    };
  }, { key, progress, theme });
  try {
    await page.goto(url);
    const main = page.locator('#daily-content'); await main.waitFor();
    const home = async () => {
      await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '课程', exact: true }).click();
      await main.locator('.course-current, .daily-empty').first().waitFor();
    };
    await home();
    const saved = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
    const snapshotOthers = () => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), otherKeys);
    const others = await snapshotOthers();
    const result = await run({ page, main, saved, home, progress });
    assert.deepEqual(await snapshotOthers(), others, 'other sections and historical evidence remain unchanged');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    assert.equal(await page.locator('button button').count(), 0);
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
    report.scenarios.push({ name, width, theme, passed: true, result });
    console.log('PASS', name);
  } finally { await context.close(); }
}

async function assertScope(main, progress) {
  const overview = courseOverview(progress, lessons); assert.ok(overview);
  const scope = main.locator('.course-daily-scope');
  await scope.getByRole('heading', { name: '本节要学的内容', exact: true }).waitFor();
  assert.deepEqual(await scope.locator('[data-target-id]').evaluateAll(nodes => nodes.map(node => node.dataset.targetId)), overview.targets.map(item => item.id));
  for (const target of overview.targets) {
    const row = scope.locator(`[data-target-id="${target.id}"]`);
    assert.equal(await row.locator('.course-example-meaning').textContent(), target.zh);
    await row.getByRole('button', { name: `朗读 ${target.en}`, exact: true }).waitFor();
    assert.equal(await row.locator('.daily-inline-slow').count(), 1);
    if (target.note) assert.equal(await row.locator('.course-scope-note').textContent(), target.note);
  }
  return overview;
}

try {
  for (const [width, theme] of [[1440, 'lagoon'], [320, 'mint']]) {
    await scenario(`every-scope-${width}`, createDailyProgress(), width, theme, async ({ main, saved }) => {
      const visited = [], targets = new Set();
      for (let round = 0; round < 100; round++) {
        const before = await saved();
        if (!hasAdaptiveContent(before, lessons)) break;
        const overview = await assertScope(main, before);
        overview.targets.forEach(item => targets.add(item.id));
        visited.push({ ids: overview.targets.map(item => item.id), source: overview.source.id });
        await main.getByRole('button', { name: skipLabel, exact: true }).click();
        await main.getByRole('button', { name: '撤销跳过', exact: true }).waitFor();
        const after = await saved();
        for (const id of overview.targets.map(item => item.id)) assert.ok(after.learning.selfKnown[id]);
        assert.deepEqual(after.knowledge, before.knowledge); assert.deepEqual(after.lessons, before.lessons);
        assert.equal(after.learning.rounds, 0); assert.equal(after.learning.turns, 0);
        assert.deepEqual(after.learning.targets, {});
        assert.equal(parseDailyProgress(JSON.stringify(after), lessons).writable, true);
        if (after.session) await main.locator(`[data-target-id="${after.session.adaptive.focusIds[0]}"]`).waitFor();
      }
      const after = await saved();
      assert.equal(hasAdaptiveContent(after, lessons), false);
      assert.deepEqual([...targets].sort(), [...new Set(lessons.filter(item => !item.referenceOnly).flatMap(item => item.learningTargets))].sort());
      await main.getByRole('heading', { name: '当前内容已学或跳过', exact: true }).waitFor();
      return { scopes: visited.length, distinctTargets: targets.size, includesSixTargets: visited.some(item => item.ids.length === 6), visited };
    });
  }

  for (const [width, theme] of [[1440, 'lagoon'], [320, 'pearl'], [390, 'sky'], [768, 'mint']]) {
    await scenario(`six-targets-${theme}-${width}`, sixTargetFixture(), width, theme, async ({ page, main, saved, home }) => {
      const before = await saved(), overview = await assertScope(main, before); assert.equal(overview.targets.length, 6);
      if (theme === 'lagoon') {
        const row = main.locator('[data-target-id="daily-word-student"]');
        for (const selector of ['.daily-phrase-content', '.daily-inline-slow']) {
          const count = await page.evaluate(() => window.scopeAudio.length);
          await row.locator(selector).click();
          await page.waitForFunction(count => window.scopeAudio.length > count, count);
        }
        const played = await page.evaluate(() => window.scopeAudio);
        assert.equal(played.at(-2).rate, 1); assert.equal(played.at(-1).rate, .72); assert.equal(played.at(-1).pitch, true);
        assert.equal(played.at(-2).src, played.at(-1).src); report.audio.push(...played);
        assert.deepEqual(await saved(), before, 'preview audio does not introduce targets');
      }
      await page.screenshot({ path: `${output}/complete-home-${theme}-${width}.png`, fullPage: true });
      await main.getByRole('button', { name: skipLabel, exact: true }).click();
      await main.getByRole('button', { name: '撤销跳过', exact: true }).waitFor();
      const skipped = await saved();
      assert.deepEqual(skipped.learning.targets, before.learning.targets);
      for (const item of overview.targets) assert.ok(skipped.learning.selfKnown[item.id]);
      await page.reload(); await home(); assert.deepEqual(await saved(), skipped);
      await assertScope(main, skipped);
      await main.getByRole('button', { name: '撤销跳过', exact: true }).click();
      await main.locator('.daily-study-card').waitFor();
      const undone = await saved();
      assert.deepEqual(undone.session, before.session); assert.deepEqual(undone.learning, before.learning);
      await main.locator('.daily-study-card').getByRole('heading', { name: '本节要学的内容', exact: true }).waitFor();
      const taught = await main.locator('.daily-phrase-content strong').allTextContents();
      assert.ok(overview.targets.every(item => taught.includes(item.en)));
      await main.getByRole('button', { name: '开始练习', exact: true }).click();
      await main.locator('.daily-question').waitFor();
      const started = await saved();
      await page.reload(); assert.deepEqual(await saved(), started);
      assert.equal(await main.getByRole('button', { name: skipLabel, exact: true }).count(), 0);
      return { targets: overview.targets.map(item => item.id), skippedAllSix: true, undoRestoredScope: true };
    });
  }

  for (const kind of ['mixed', 'weak']) await scenario(`${kind}-complete-scope`, courseFixture(lessons, kind), 390, 'lagoon', async ({ main, saved }) => {
    const before = await saved(), overview = await assertScope(main, before);
    await main.getByRole('button', { name: skipLabel, exact: true }).click();
    await main.getByRole('button', { name: '撤销跳过', exact: true }).waitFor();
    const after = await saved();
    assert.deepEqual(after.learning.targets, before.learning.targets); assert.deepEqual(after.knowledge, before.knowledge);
    return { newCount: overview.newCount, oldCount: overview.oldCount, ids: overview.targets.map(item => item.id) };
  });

  await scenario('resumed-exercise-retains-draft', courseFixture(lessons, 'saved'), 390, 'mint', async ({ main, saved }) => {
    const before = await saved(); await assertScope(main, before);
    assert.equal(await main.getByRole('button', { name: skipLabel, exact: true }).count(), 0);
    await main.locator('.course-start button').click(); await main.locator('.daily-question').waitFor();
    assert.deepEqual(await saved(), before);
    assert.equal(await main.locator('.daily-fill input, .daily-write').first().inputValue(), 'unfinished answer');
  });

  await scenario('unknown-record-stays-readonly', '{"version":999}', 320, 'pearl', async ({ page, main }) => {
    await main.locator('.daily-notice[role="alert"]').waitFor();
    assert.equal(await main.getByRole('button', { name: skipLabel, exact: true }).isDisabled(), true);
    assert.equal(await main.locator('.course-start button').isDisabled(), true);
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), '{"version":999}');
  });
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
}
