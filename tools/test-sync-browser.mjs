// Two isolated Chrome profiles: actual production web origin and the APK asset origin.
// With CODEWORDS_LIVE_SYNC=1 only the phone's packaged assets are simulated; both
// profiles use the deployed Pages Function and D1. No real user's browser data is read.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { syncServer } from './sync-test-server.mjs';
import { SYNC_KEYS, sameValue } from '../src/syncProtocol.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const webOrigin = 'https://programming-english-learning-site.pages.dev', phoneOrigin = 'https://appassets.androidplatform.net';
const live = process.env.CODEWORDS_LIVE_SYNC === '1', dist = path.resolve('dist'), output = path.resolve('artifacts/sync-audit');
await mkdir(output, { recursive: true });
const server = syncServer(), errors = [], results = [];
const earned = JSON.parse(await readFile('artifacts/adaptive-course/earned-fixtures.json', 'utf8'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const contexts = [];
async function device(phone, seed = {}) {
  const context = await browser.newContext({ viewport: phone ? { width: 360, height: 780 } : { width: 1280, height: 900 }, isMobile: phone, hasTouch: phone, reducedMotion: 'reduce' });
  contexts.push(context); let offline = false, requests = 0;
  await context.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.origin === webOrigin && url.pathname === '/api/sync') {
      if (request.method() !== 'OPTIONS') requests++;
      if (offline) return route.abort('internetdisconnected');
      if (live) return route.continue();
      const response = await server.fetch(request.url(), { method: request.method(), headers: await request.allHeaders(), body: request.postData() || undefined });
      return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
    }
    if (!phone && live) return route.continue();
    const prefix = phone ? '/assets/web/' : '/';
    assert.equal(url.origin, phone ? phoneOrigin : webOrigin); assert.ok(url.pathname.startsWith(prefix));
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html', file = path.resolve(dist, relative);
    assert.ok(file.startsWith(dist + path.sep));
    const mime = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json', '.mp3': 'audio/mpeg', '.svg': 'image/svg+xml', '.png': 'image/png' };
    const headers = { 'content-type': mime[path.extname(file)] || 'application/octet-stream' };
    if (relative === 'index.html') {
      const java = await readFile('android/app/src/main/java/com/codewords/english/MainActivity.java', 'utf8');
      headers['content-security-policy'] = phone ? java.match(/"Content-Security-Policy", "([^"]+)"/)[1] : (await readFile('public/_headers', 'utf8')).match(/Content-Security-Policy: (.+)/)[1];
    }
    try { return await route.fulfill({ status: 200, body: await readFile(file), headers }); } catch { return route.fulfill({ status: 404, body: '' }); }
  });
  const page = await context.newPage(); page.setDefaultTimeout(live ? 30000 : 12000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(seed => { if (!sessionStorage.getItem('sync-fixture')) { Object.entries(seed).forEach(([key, value]) => localStorage.setItem(key, value)); sessionStorage.setItem('sync-fixture', '1'); } }, seed);
  await page.goto(phone ? `${phoneOrigin}/assets/web/index.html` : webOrigin);
  await page.getByRole('button', { name: /^设备同步/ }).waitFor();
  return { page, context, offline: value => { offline = value; }, requests: () => requests };
}
const nav = (page, name) => page.getByRole('navigation', { name: '学习导航' }).getByRole('button', { name, exact: true }).click();
async function openSync(page) { if (!await page.locator('.sync-dialog').count()) await page.getByRole('button', { name: /^设备同步/ }).click(); }
async function closeSync(page) { if (await page.locator('.sync-dialog').count()) await page.getByRole('button', { name: '关闭同步设置' }).click(); }
async function sync(page) { await openSync(page); const before = await page.evaluate(() => JSON.parse(localStorage.getItem('codewords-sync-v1')).syncedAt); await page.getByRole('button', { name: '立即同步', exact: true }).click(); await page.waitForFunction(before => JSON.parse(localStorage.getItem('codewords-sync-v1')).syncedAt > before, before); await page.locator('.sync-status.sync-synced').waitFor(); }
const snapshot = page => page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage.getItem(key)])), SYNC_KEYS);
async function compareDevices(a, b) {
  const aa = await snapshot(a), bb = await snapshot(b), differences = [];
  function diff(a, b, prefix) {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    if (a && b && typeof a === 'object' && typeof b === 'object') for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key], b[key], prefix + '.' + key);
    else if (differences.length < 20) differences.push({ path: prefix, a, b });
  }
  for (const key of SYNC_KEYS) if (!sameValue(aa[key], bb[key])) diff(JSON.parse(aa[key]), JSON.parse(bb[key]), key);
  assert.deepEqual(differences, [], 'device records differ');
}
try {
  const web = await device(false, { 'codewords-mastered': '[1,2]', 'codewords-favorites': '[1,3561]', 'codewords-daily-v1': earned.daily.course, 'codewords-programming-course-v1': earned.programming.course, 'codewords-review-v1': earned.programming.review });
  const phone = await device(true);
  for (const size of [{ width: 320, height: 640 }, { width: 360, height: 780 }, { width: 412, height: 915 }, { width: 844, height: 390 }]) {
    await phone.page.setViewportSize(size);
    for (const theme of ['minimal', 'sketch', 'print', 'graffiti']) {
      await phone.page.getByLabel('界面风格', { exact: true }).selectOption(theme); await openSync(phone.page);
      const bounds = await phone.page.evaluate(() => ({ width: innerWidth, dialogWidth: document.querySelector('.sync-dialog').getBoundingClientRect().width, headingHeight: document.querySelector('#sync-heading').getBoundingClientRect().height, document: document.documentElement.scrollWidth, outside: [...document.querySelectorAll('.sync-dialog button, .sync-dialog textarea')].filter(item => { const box = item.getBoundingClientRect(); return box.width && (box.left < 0 || box.right > innerWidth); }).length }));
      assert.equal(bounds.outside, 0); assert.ok(bounds.document <= bounds.width); assert.ok(bounds.dialogWidth >= Math.min(bounds.width - 40, 500), 'dialog must use available width'); assert.ok(bounds.headingHeight < 65, 'heading must not collapse into vertical text');
      if (!live && (size.width === 320 || size.width === 844)) await phone.page.screenshot({ path: path.join(output, `sync-${theme}-${size.width}.png`) });
      await closeSync(phone.page);
    }
  }
  results.push('sync dialog fits 320/360/412/844px and all four themes');
  await phone.page.setViewportSize({ width: 360, height: 780 }); await phone.page.getByLabel('界面风格', { exact: true }).selectOption('minimal');
  await openSync(web.page); await web.page.getByRole('button', { name: '开启同步', exact: true }).click(); await web.page.locator('.sync-status.sync-synced').waitFor();
  await web.page.getByRole('button', { name: '显示同步码' }).click(); const code = await web.page.getByRole('textbox', { name: '本机同步码' }).inputValue();
  assert.match(code, /^[a-f0-9]{64}$/); await web.page.getByRole('button', { name: '隐藏同步码' }).click();
  await openSync(phone.page); await phone.page.getByLabel('输入已有同步码').fill(code); await phone.page.getByRole('button', { name: '连接已有进度', exact: true }).click(); await phone.page.locator('.sync-status.sync-synced').waitFor();
  await compareDevices(phone.page, web.page);
  results.push('web progress pairs into the APK origin, including historical mastery and both saved curricula');
  await closeSync(web.page); await nav(web.page, '收藏'); await web.page.locator('.word-card .favorite').first().click(); await sync(web.page); await sync(phone.page);
  await compareDevices(phone.page, web.page);
  results.push('real favorite control changes sync from web to phone');
  if (!live) {
    const before = web.requests(), other = await web.context.newPage(); await other.goto(webOrigin);
    await other.getByRole('button', { name: /^设备同步/ }).waitFor();
    await new Promise(resolve => setTimeout(resolve, 6500));
    assert.ok(web.requests() - before <= 2, 'metadata-only storage events must not create a cross-tab sync loop');
    await other.close(); results.push('two web tabs do not trigger a repeating sync loop');
  }
  await closeSync(phone.page); await nav(phone.page, '词汇库'); phone.offline(true);
  await phone.page.locator('.word-card .favorite').first().click(); await openSync(phone.page); await phone.page.getByRole('button', { name: '立即同步', exact: true }).click(); await phone.page.locator('.sync-status.sync-error').waitFor();
  const offlineFavorites = (await snapshot(phone.page))['codewords-favorites'];
  phone.offline(false); await sync(phone.page); await sync(web.page);
  assert.deepEqual(JSON.parse((await snapshot(web.page))['codewords-favorites']).sort(), JSON.parse(offlineFavorites).sort());
  results.push('phone offline changes remain local and upload after reconnection');
  await phone.page.reload(); await sync(phone.page); assert.deepEqual(JSON.parse((await snapshot(phone.page))['codewords-favorites']).sort(), JSON.parse(offlineFavorites).sort());
  results.push('pairing and synced progress survive a full reload');
  await web.page.evaluate(() => localStorage.setItem('codewords-mastered', '[1,2,3]'));
  await phone.page.evaluate(() => localStorage.setItem('codewords-mastered', '[1,2,4]'));
  await sync(web.page); await openSync(phone.page); await phone.page.getByRole('button', { name: '立即同步', exact: true }).click(); await phone.page.locator('.sync-status.sync-conflict').waitFor();
  assert.equal((await snapshot(phone.page))['codewords-mastered'], '[1,2,4]');
  await phone.page.screenshot({ path: path.join(output, live ? 'live-conflict.png' : 'conflict.png') });
  await phone.page.getByRole('button', { name: '备份后使用另一设备记录' }).click(); await phone.page.locator('.sync-status.sync-synced').waitFor();
  assert.equal((await snapshot(phone.page))['codewords-mastered'], '[1,2,3]');
  assert.equal(await phone.page.evaluate(() => JSON.parse(localStorage.getItem('codewords-sync-backup-v1')).local['codewords-mastered']), '[1,2,4]');
  results.push('conflicting progress is visibly held until a choice, then both copies are backed up');
  await phone.page.getByRole('button', { name: '断开本机同步' }).click(); await phone.page.getByRole('button', { name: '确认断开', exact: true }).click(); await phone.page.getByRole('button', { name: '开启同步', exact: true }).waitFor();
  assert.equal((await snapshot(phone.page))['codewords-mastered'], '[1,2,3]');
  assert.equal(await phone.page.evaluate(() => localStorage.getItem('codewords-sync-v1')), null);
  results.push('disconnect preserves local learning data');
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, live ? 'live-results.json' : 'results.json'), JSON.stringify({ live, at: new Date().toISOString(), results, pageErrors: errors }, null, 2));
  console.log(`PASS ${results.length} ${live ? 'live D1' : 'isolated SQLite'} browser scenarios.`);
} finally { await Promise.all(contexts.map(context => context.close())); await browser.close(); }
