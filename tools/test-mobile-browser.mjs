import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { vocabulary } from '../src/vocabulary.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { DAILY_KEY, createDailyProgress, createDailySession, parseDailyProgress } from '../src/dailyProgress.ts';
import { PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { REVIEW_KEY } from '../src/review.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const baseURL = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
assert.match(baseURL, /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/);
const output = path.resolve('artifacts/mobile-audit');
await mkdir(output, { recursive: true });
const earned = JSON.parse(await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8'));
const seed = { [DAILY_KEY]: earned.daily.course, [PROGRAMMING_COURSE_KEY]: earned.programming.course, [REVIEW_KEY]: earned.programming.review, 'codewords-favorites': '[1,2,3561]' };
const configs = { daily: { key: DAILY_KEY, lessons: adaptiveDailyLessons }, programming: { key: PROGRAMMING_COURSE_KEY, lessons: adaptiveProgrammingLessons } };
const results = [], failures = [], findings = [], errors = [];
const browser = await chromium.launch({ channel: 'chrome', headless: true });
function fixture(section, kind) {
  const { key, lessons } = configs[section];
  const lesson = lessons.find(lesson => lesson.exercises.some(task => task.kind === kind));
  if (!lesson) return;
  const task = lesson.exercises.find(task => task.kind === kind), now = Date.now(), ids = task.knowledgeIds;
  const progress = createDailyProgress();
  progress.learning = { version: 1, turns: 0, rounds: 0, targets: Object.fromEntries(ids.map(id => [id, { introducedAt: now, confidence: 0, abilities: {}, lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: false, readyAt: 0 }])) };
  progress.session = { ...createDailySession({ ...lesson, exercises: [task] }, 'lesson', now), stage: 'exercise', adaptive: { version: 1, round: 1, focusIds: ids, newIds: ids, sourceLessonId: lesson.id, seed: 1, budget: 8 } };
  assert.equal(parseDailyProgress(JSON.stringify(progress), lessons).writable, true);
  return { state: { [key]: JSON.stringify(progress), 'codewords-section': section }, task };
}
async function open(state = seed, width = 360, height = 780) {
  const context = await browser.newContext({ viewport: { width, height }, isMobile: true, hasTouch: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  const page = await context.newPage(); page.setDefaultTimeout(6000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (event.type() === 'error' && !event.location().url.endsWith('/favicon.ico')) errors.push(event.text()); });
  await page.addInitScript(state => { if (!sessionStorage.getItem('mobile-qa')) { Object.entries(state).forEach(([key, value]) => localStorage.setItem(key, value)); sessionStorage.setItem('mobile-qa', '1'); } }, state);
  await page.goto(baseURL);
  await page.getByRole('navigation', { name: '学习导航' }).waitFor();
  return { page, context };
}
const go = (page, label) => page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: label, exact: true }).click();
async function check(page, label) {
  const report = await page.evaluate(() => {
    const viewport = innerWidth;
    const visible = element => { const style = getComputedStyle(element), box = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && box.width > 0 && box.height > 0 && !element.closest('[hidden]'); };
    const overflow = [...document.querySelectorAll('main button, main input, main select, main textarea, main strong, .site-header button, .lesson-overlay button, .lesson-overlay input')].filter(visible).filter(element => { const box = element.getBoundingClientRect(); return box.left < -1 || box.right > viewport + 1; }).map(element => ({ element: element.className, text: (element.textContent || element.getAttribute('aria-label') || '').slice(0, 100), box: element.getBoundingClientRect().toJSON() }));
    const smallTargets = [...document.querySelectorAll('.slow-button, .daily-inline-slow, .section-switch button, .theme-picker select, .favorite, .daily-expression-star')].filter(visible).filter(element => { const box = element.getBoundingClientRect(); return box.height < 44 || box.width < 44; }).map(element => ({ element: element.className, text: element.textContent, height: element.getBoundingClientRect().height }));
    const zoomInputs = [...document.querySelectorAll('main input, main textarea')].filter(visible).filter(element => parseFloat(getComputedStyle(element).fontSize) < 16).map(element => element.className);
    return { viewport, documentWidth: document.documentElement.scrollWidth, overflow, smallTargets, zoomInputs };
  });
  findings.push({ label, ...report });
  assert.ok(report.documentWidth <= report.viewport + 1, `${label}: document overflow ${report.documentWidth}`);
  assert.deepEqual(report.overflow, [], `${label}: controls outside screen`);
}
async function scenario(name, test) {
  if (process.env.CODEWORDS_SCENARIO && !name.includes(process.env.CODEWORDS_SCENARIO)) return;
  try { await test(); results.push(name); console.log(`PASS ${name}`); }
  catch (error) { failures.push({ name, error: error.stack ?? String(error) }); console.error(`FAIL ${name}\n${error.stack ?? error}`); }
}
try {
  await scenario('phone pages, long words and settings in all themes', async () => {
    const { page, context } = await open();
    try {
      for (const size of [{ width: 320, height: 640 }, { width: 360, height: 780 }, { width: 412, height: 915 }, { width: 844, height: 390 }]) {
        await page.setViewportSize(size);
        for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
          await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
          for (const [section, library] of [['编程英语', '词汇库'], ['日常英语', '表达库']]) {
            await page.getByRole('button', { name: section, exact: true }).click();
            for (const view of ['课程', '复习', library, '收藏']) {
              await go(page, view); await check(page, `${size.width}/${theme}/${section}/${view}`);
            }
          }
          await page.getByRole('button', { name: '编程英语', exact: true }).click(); await go(page, '词汇库');
          const longest = [...vocabulary].sort((a, b) => b.word.length - a.word.length)[0];
          await page.getByLabel('搜索当前列表').fill(longest.word);
          await check(page, `${size.width}/${theme}/long-word`);
          await page.screenshot({ path: path.join(output, `long-word-${theme}-${size.width}.png`) });
          await page.getByRole('button', { name: '语音设置', exact: true }).click();
          await check(page, `${size.width}/${theme}/settings`);
          await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
          await page.getByLabel('搜索当前列表').fill('');
        }
      }
    } finally { await context.close(); }
  });
  await scenario('word review dictation stays reachable above the mobile keyboard', async () => {
    const now = Date.now();
    const skill = extra => ({ level: 3, streak: 1, intervalDays: 1, dueAt: now + 86400000, lastPracticedAt: now - 86400000, lastSuccessDay: '', lastFailureDay: '', needsPractice: false, ...extra });
    for (const word of [vocabulary[0], [...vocabulary].sort((a, b) => b.word.length - a.word.length)[0]]) {
      const state = { 'codewords-mastered': JSON.stringify([word.id]), [REVIEW_KEY]: JSON.stringify({ version: 1, words: { [word.id]: { meaning: skill(), listening: skill(), context: skill(), spelling: skill({ dueAt: 0, needsPractice: true }) } } }) };
      const { page, context } = await open(state, 320, 640);
      try {
        await go(page, '复习');
        await page.getByRole('button', { name: '开始到期复习', exact: true }).click();
        const exercise = page.locator('.lesson-exercise-dictation'); await exercise.waitFor();
        for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
          await page.locator('.lesson-overlay').getByLabel('界面风格', { exact: true }).selectOption(theme);
          await check(page, `review/${word.id}/${theme}`);
        }
        const input = exercise.locator('input').first(); await input.fill('test');
        await page.setViewportSize({ width: 320, height: 380 });
        await page.waitForFunction(() => {
          const input = document.activeElement, footer = document.querySelector('.lesson-footer');
          return input && footer && input.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
        });
        await check(page, `review/${word.id}/keyboard`);
        await page.screenshot({ path: path.join(output, `keyboard-review-${word.id}.png`) });
      } finally { await context.close(); }
    }
  });
  for (const section of ['programming', 'daily']) for (const kind of ['choice', 'listen', 'order', 'fill', 'write', 'speak']) {
    const current = fixture(section, kind); if (!current) continue;
    await scenario(`${section} ${kind} at narrow and keyboard-height viewports`, async () => {
      const { page, context } = await open(current.state, 320, 640);
      try {
        const root = page.locator(`#${section}-content`), question = root.locator('.daily-question');
        await question.waitFor();
        for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
          await page.getByLabel('界面风格', { exact: true }).selectOption(theme);
          await check(page, `${section}/${kind}/${theme}`);
        }
        if (kind === 'speak') await root.getByRole('button', { name: '自己表达', exact: true }).click();
        const input = question.locator('input, textarea').first();
        if (await input.count()) {
          await input.fill('test');
          await page.setViewportSize({ width: 320, height: 380 });
          await page.waitForFunction(() => {
            const input = document.activeElement, footer = document.querySelector('main:not([hidden]) .daily-controls');
            return input && footer && input.getBoundingClientRect().bottom <= footer.getBoundingClientRect().top;
          });
          await check(page, `${section}/${kind}/keyboard`);
          const box = await input.boundingBox(), footer = await root.locator('.daily-controls').boundingBox();
          assert.ok(box && footer && box.y + box.height <= footer.y + 1, `Input covered by answer bar: ${JSON.stringify({ box, footer })}`);
          await page.screenshot({ path: path.join(output, `keyboard-${section}-${kind}.png`) });
          await page.setViewportSize({ width: 320, height: 640 });
        }
        if (kind === 'choice' || kind === 'listen') {
          await question.getByRole('button', { name: current.task.answers[0], exact: true }).click();
          await root.locator('.daily-controls .primary').click();
          await root.locator('.daily-feedback').waitFor();
          await check(page, `${section}/${kind}/feedback`);
          await root.locator('.daily-feedback-details > summary').click();
          await check(page, `${section}/${kind}/explanation`);
        }
      } finally { await context.close(); }
    });
  }
} finally {
  await writeFile(path.join(output, 'browser-results.json'), JSON.stringify({ baseURL, results, failures, findings, errors, note: 'Chrome touch emulation; keyboard cases resize the viewport, not a physical keyboard.' }, null, 2));
  await browser.close();
}
assert.deepEqual(failures, []); assert.deepEqual(errors, []);
console.log(`PASS ${results.length} mobile scenarios.`);
