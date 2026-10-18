import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 1120 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('codewords-section', 'foundation'));
    await page.goto('http://localhost:5186/');
    await page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name: '音标与发音', exact: true }).click();
    await page.locator('.phonemic-intro').getByRole('button', { name: '认识元音、辅音和音节', exact: true }).click();
    const article = page.locator('[data-topic="foundation-sound-concepts"]');
    await article.getByRole('heading', { name: '认识元音、辅音和音节', exact: true }).waitFor();
    const bounds = await article.boundingBox();
    await page.setViewportSize({ width, height: Math.ceil(bounds.height) + 240 });
    await page.evaluate(() => window.scrollBy(0, document.querySelector('.foundation-concepts').getBoundingClientRect().top - 210));
    await page.screenshot({ path: fileURLToPath(new URL(`final-${width}.png`, import.meta.url)) });
    await context.close();
  }
} finally { await browser.close(); }
