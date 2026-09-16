import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const stage = process.argv[2] || 'before';
if (!['before', 'after'].includes(stage)) throw new Error('Expected before or after');
const out = `D:/coding项目/交互式英语学习网站/artifacts/busuu-redesign/${stage}`;
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  for (const width of [1440, 1920, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('http://localhost:5186/');
    await page.locator('.word-card').first().waitFor();
    await page.screenshot({ path: `${out}/vocabulary-${width}.png`, fullPage: true });
    if (stage === 'after' && width !== 390) {
      await page.screenshot({ path: `${out}/vocabulary-first-screen-${width}.png` });
      if (width === 1920) {
        await page.setViewportSize({ width, height: 1080 });
        await page.screenshot({ path: `${out}/vocabulary-first-screen-1920x1080.png` });
        await page.setViewportSize({ width, height: 1000 });
      }
    }
    if (width !== 390) {
      await page.getByRole('button', { name: '词库', exact: true }).click();
      await page.screenshot({ path: `${out}/library-${width}.png`, fullPage: false });
      await page.getByRole('button', { name: '语音设置', exact: true }).click();
      await page.screenshot({ path: `${out}/settings-${width}.png`, fullPage: false });
      await page.getByRole('button', { name: '关闭语音设置', exact: true }).click();
    }
    if (process.argv.includes('--main-only')) { await context.close(); console.log(`CAPTURED main ${width}`); continue; }
    await page.evaluate(() => localStorage.setItem('codewords-mastered', '[1,2,3,21,29]'));
    await page.reload();
    await page.locator('.quiz-button').click();
    await page.locator('.lesson-exercise').waitFor();
    await page.screenshot({ path: `${out}/practice-${width}.png` });
    await page.getByRole('button', { name: '暂时不会', exact: true }).click();
    await page.locator('.lesson-feedback').waitFor();
    await page.screenshot({ path: `${out}/feedback-${width}.png` });
    await context.close();
    console.log(`CAPTURED ${width}`);
  }
} finally { await browser.close(); }
