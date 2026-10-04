// Disposable Chrome profiles only; exercise the actual UI and local audio.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailyDraft, parseDailyProgress } from '../src/dailyProgress.ts';
import { skipAdaptiveCourse, planAdaptiveSession, hasAdaptiveContent, restoreSkippedTarget, beginAdaptiveLearning, previewAdaptiveScope } from '../src/adaptiveLearning.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/course-skip';
await mkdir(output, { recursive: true });
const response = await fetch(baseURL); assert.ok(response.ok);
const html = await response.text();
assert.match(html, new URL(baseURL).pathname.startsWith('/dist/') ? /assets\/[^"']+\.js/ : /src\/main\.tsx/);
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [], failures = [], errors = [], findings = [], audio = [];
const keys = { daily: 'codewords-daily-v1', programming: 'codewords-programming-course-v1' };
const catalogs = { daily: adaptiveDailyLessons, programming: adaptiveProgrammingLessons };
const skipLabel = '这些我都会，跳过本课';
async function open(section, width, theme, progress = null) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
  await context.route('http://127.0.0.1:18768/**', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"ready":false}' }));
  const page = await context.newPage(); page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('/favicon.ico')) errors.push(event.text()); });
  await page.addInitScript(({ section, theme, progress, key }) => {
    if (!sessionStorage.getItem('skip-qa')) {
      localStorage.setItem('codewords-section', section); localStorage.setItem('codewords-theme', theme);
      if (progress) localStorage.setItem(key, JSON.stringify(progress));
      sessionStorage.setItem('skip-qa', '1');
    }
    window.skipAudio = [];
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function(...args) {
      this.addEventListener('ended', () => window.skipAudio.push({ src: this.src, rate: this.playbackRate, pitch: this.preservesPitch }), { once: true });
      return play.apply(this, args);
    };
  }, { section, theme, progress, key: keys[section] });
  await page.goto(baseURL);
  const main = page.locator(`#${section}-content`); await main.waitFor();
  return { page, main, context };
}
const saved = (page, section) => page.evaluate(key => JSON.parse(localStorage.getItem(key)), keys[section]);
async function study(main) {
  if (!await main.locator('.daily-study-card').isVisible()) await main.locator('.course-start button').click();
  await main.getByRole('button', { name: skipLabel, exact: true }).waitFor();
}
async function layout(page, name) {
  const report = await page.evaluate(() => {
    const visible = element => element.getBoundingClientRect().width > 0 && !element.closest('[hidden]');
    const overflow = [...document.querySelectorAll('main button, main strong, main summary')].filter(visible).filter(element => {
      const box = element.getBoundingClientRect(); return box.left < -1 || box.right > innerWidth + 1;
    }).map(element => ({ text: element.textContent, className: element.className }));
    return { viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, overflow };
  });
  findings.push({ name, ...report });
  assert.ok(report.documentWidth <= report.viewport + 1, `${name}: document overflow`); assert.deepEqual(report.overflow, [], `${name}: controls overflow`);
  assert.equal(await page.locator('button button').count(), 0);
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
}
async function scenario(name, run) {
  if (process.env.CODEWORDS_SCENARIO && !name.includes(process.env.CODEWORDS_SCENARIO)) return;
  try { await run(); results.push(name); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack ?? String(error) }); console.error(`FAIL ${name}\n${error.stack ?? error}`); }
}
try {
  for (const section of ['daily', 'programming']) for (const width of [1440, 320]) for (const theme of ['lagoon', 'pearl', 'sky', 'mint']) {
    const name = `${section}-${width}-${theme}`;
    await scenario(name, async () => {
      const { page, main, context } = await open(section, width, theme);
      try {
        await study(main); const before = await saved(page, section);
        await layout(page, `${name}-study`);
        const focus = before.session.adaptive.focusIds;
        await main.getByRole('button', { name: skipLabel, exact: true }).click();
        await main.getByRole('button', { name: '撤销跳过', exact: true }).waitFor();
        let after = await saved(page, section);
        assert.deepEqual(Object.keys(after.learning.selfKnown).sort(), [...focus].sort());
        assert.deepEqual(after.knowledge, before.knowledge); assert.deepEqual(after.lessons, before.lessons);
        assert.equal(after.learning.turns, 0); assert.equal(after.learning.rounds, 0);
        assert.ok(after.session.adaptive.focusIds.every(id => !focus.includes(id)));
        const nextTheme = theme === 'mint' ? 'lagoon' : 'mint';
        await page.getByLabel('界面配色', { exact: true }).selectOption(nextTheme);
        assert.deepEqual(await saved(page, section), after, 'palette switching keeps the session');
        await page.getByLabel('界面配色', { exact: true }).selectOption(theme);
        await page.reload(); await main.waitFor();
        assert.deepEqual(await saved(page, section), after, 'refresh preserves the drawn next question and undo');
        await main.getByRole('button', { name: '撤销跳过', exact: true }).click();
        const undone = await saved(page, section);
        assert.deepEqual(undone.session, before.session); assert.deepEqual(undone.learning, before.learning);
        assert.equal(undone.skipUndo, undefined);
        await main.getByRole('button', { name: skipLabel, exact: true }).click();
        await main.getByRole('button', { name: /返回课程/ }).click();
        await main.locator('.course-skipped summary').click();
        assert.equal(await main.locator('.course-skipped li').count(), focus.length);
        await layout(page, `${name}-skipped`);
        const first = main.locator('.course-skipped li').first();
        if (theme === 'lagoon' && width === 1440) {
          for (const selector of ['.daily-expression-content', '.daily-inline-slow']) {
            const count = await page.evaluate(() => window.skipAudio.length);
            await first.locator(selector).click();
            await page.waitForFunction(count => window.skipAudio.length > count, count, { timeout: 20000 });
          }
          const played = await page.evaluate(() => window.skipAudio);
          assert.equal(played.at(-2).rate, 1); assert.equal(played.at(-1).rate, .72); assert.equal(played.at(-1).pitch, true);
          assert.equal(played.at(-2).src, played.at(-1).src);
          audio.push({ section, events: played });
        }
        const knownBefore = Object.keys((await saved(page, section)).learning.selfKnown);
        await first.getByRole('button', { name: /重新加入课程/ }).click();
        after = await saved(page, section);
        assert.equal(Object.keys(after.learning.selfKnown).length, knownBefore.length - 1);
        assert.equal(after.skipUndo, undefined);
        assert.equal(await main.locator('.course-skipped li').count(), focus.length - 1);
        await page.reload(); await main.waitFor(); assert.deepEqual(await saved(page, section), after);
        await study(main); await main.getByRole('button', { name: '开始练习', exact: true }).click();
        await main.locator('.daily-question').waitFor();
        assert.equal(await main.getByRole('button', { name: skipLabel, exact: true }).count(), 0);
        assert.equal(await main.getByRole('button', { name: '撤销跳过', exact: true }).count(), 0);
        assert.equal(parseDailyProgress(JSON.stringify(await saved(page, section)), catalogs[section]).writable, true);
        const other = await page.evaluate(key => localStorage.getItem(key), keys[section === 'daily' ? 'programming' : 'daily']);
        assert.equal(other, null, 'the other section is untouched');
      } finally { await context.close(); }
    });
  }
  for (const section of ['daily', 'programming']) await scenario(`${section}-all-skipped-restore`, async () => {
    let progress = createDailyProgress(), n = 0;
    progress.session = planAdaptiveSession(progress, catalogs[section]);
    while (progress.session) { assert.ok(n++ < 100); progress = skipAdaptiveCourse(progress, catalogs[section]); }
    assert.equal(hasAdaptiveContent(progress, catalogs[section]), false);
    const { page, main, context } = await open(section, 320, 'lagoon', progress);
    try {
      await main.getByRole('heading', { name: '当前内容已学或跳过', exact: true }).waitFor();
      await main.locator('.course-skipped summary').click();
      await layout(page, `${section}-all-skipped-list`);
      await main.locator('.course-skipped li').first().getByRole('button', { name: /重新加入课程/ }).click();
      await main.locator('.course-current').waitFor(); await study(main);
      await main.getByRole('button', { name: '开始练习', exact: true }).click(); await main.locator('.daily-question').waitFor();
      await layout(page, `${section}-all-skipped-restore`);
    } finally { await context.close(); }
  });
  await scenario('daily-skipped-word-real-typo-returns', async () => {
    const lessons = adaptiveDailyLessons;
    let progress = createDailyProgress(), n = 0;
    progress.session = planAdaptiveSession(progress, lessons);
    while (progress.session) { assert.ok(n++ < 100); progress = skipAdaptiveCourse(progress, lessons); }
    progress = restoreSkippedTarget(progress, 'from-china');
    progress.session = planAdaptiveSession(progress, lessons);
    progress = beginAdaptiveLearning(progress, lessons);
    const question = lessons.flatMap(l => l.practice).find(q => q.id.endsWith('-from-china-write'));
    progress.session = { ...progress.session, queue: [{ exerciseId: question.id, retry: false }], draft: createDailyDraft(question) };
    const { page, main, context } = await open('daily', 320, 'mint', progress);
    try {
      await main.locator('textarea').fill('I am form China.');
      await main.getByRole('button', { name: '检查', exact: true }).click();
      await main.locator('.answer-correction').waitFor();
      let after = await saved(page, 'daily');
      assert.equal(after.learning.selfKnown['daily-word-from'], undefined);
      assert.equal(after.learning.targets['daily-word-from'].lastErrorAbility, 'spelling');
      const target = after.learning.targets['daily-word-from'];
      await page.reload(); await main.locator('.answer-correction').waitFor();
      assert.deepEqual((await saved(page, 'daily')).learning.targets['daily-word-from'], target);
      await main.locator('textarea').fill('I am from China.');
      await main.getByRole('button', { name: '再检查', exact: true }).click(); await main.locator('.daily-feedback').waitFor();
      after = await saved(page, 'daily');
      assert.deepEqual(after.learning.targets['daily-word-from'], target);
      assert.equal(after.learning.targets['daily-word-from'].readyAt, 0);
      assert.ok(previewAdaptiveScope(after, lessons).focusIds.includes('daily-word-from'));
      await layout(page, 'daily-skipped-word-real-typo-returns');
    } finally { await context.close(); }
  });
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify({ baseURL, results, failures, errors, findings, audio }, null, 2));
}
assert.deepEqual(failures, []); assert.deepEqual(errors, []);
console.log(`Passed ${results.length} course skip browser scenarios.`);
