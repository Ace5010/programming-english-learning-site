import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgressSync, SYNC_META, SYNC_BACKUP, SYNC_JOURNAL, recoverSyncJournal, readSnapshot, SYNC_ENDPOINT } from '../src/progressSync.ts';
import { emptySnapshot, mergeSnapshots, sameSnapshot } from '../src/syncProtocol.ts';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { createDailyProgress } from '../src/dailyProgress.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';
const favoriteKey = 'codewords-favorites', masteredKey = 'codewords-mastered';
const put = (server, code, revision, snapshot) => server.fetch(SYNC_ENDPOINT, { method: 'PUT', headers: { Authorization: `Bearer ${code}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ version: 1, revision, snapshot }) });
function client(server, storage = new MemoryStore(), extra = {}) {
  const engine = new ProgressSync({ storage, fetch: server.fetch, validate: validateProgressSnapshot, ...extra }); engine.initialize();
  return { engine, storage };
}
async function pair(server) {
  const a = client(server), b = client(server);
  await a.engine.connect(); await b.engine.connect(a.engine.code());
  assert.equal(a.engine.status.state, 'synced'); assert.equal(b.engine.status.state, 'synced'); return { a, b };
}
test('existing mastered words, favorites and independent course keys survive first phone pairing', async () => {
  const server = syncServer(), web = client(server), phone = client(server);
  web.storage.setItem(masteredKey, '[1,3,99999]'); web.storage.setItem(favoriteKey, '[5]');
  web.storage.setItem('codewords-daily-v1', JSON.stringify({ ...createDailyProgress(), favorites: ['hello'] }));
  phone.storage.setItem('codewords-daily-v1', JSON.stringify(createDailyProgress()));
  await web.engine.connect(); await phone.engine.connect(web.engine.code());
  assert.equal(phone.engine.status.state, 'synced');
  assert.equal(phone.storage.getItem(masteredKey), '[1,3,99999]');
  assert.equal(phone.storage.getItem('codewords-daily-v1'), web.storage.getItem('codewords-daily-v1'));
  assert.equal(phone.storage.getItem('codewords-programming-course-v1'), null);
});
test('offline changes reconnect and another device receives them', async () => {
  const server = syncServer(), { a, b } = await pair(server); let offline = true;
  const offlineClient = client(server, a.storage, { fetch: (...args) => { if (offline) throw new TypeError('offline'); return server.fetch(...args); } });
  a.storage.setItem(favoriteKey, '[8]'); await offlineClient.engine.sync();
  assert.equal(offlineClient.engine.status.state, 'error'); assert.equal(a.storage.getItem(favoriteKey), '[8]');
  offline = false; await offlineClient.engine.sync(); await b.engine.sync(); assert.equal(b.storage.getItem(favoriteKey), '[8]');
});
test('concurrent favorite additions and removals merge from shared base', async () => {
  const server = syncServer(), { a, b } = await pair(server);
  a.storage.setItem(favoriteKey, '[1,2]'); await a.engine.sync(); await b.engine.sync();
  a.storage.setItem(favoriteKey, '[1,3]'); b.storage.setItem(favoriteKey, '[2,4]');
  await Promise.all([a.engine.sync(), b.engine.sync()]); await a.engine.sync(); await b.engine.sync();
  assert.equal(a.storage.getItem(favoriteKey), '[3,4]'); assert.equal(b.storage.getItem(favoriteKey), '[3,4]');
});
test('independent daily and programming changes combine without mixing their IDs', async () => {
  const server = syncServer(), { a, b } = await pair(server);
  a.storage.setItem(masteredKey, '[42]'); b.storage.setItem('codewords-daily-v1', JSON.stringify({ ...createDailyProgress(), favorites: ['hello'] }));
  await a.engine.sync(); await b.engine.sync(); await a.engine.sync();
  assert.ok(sameSnapshot(readSnapshot(a.storage), readSnapshot(b.storage)));
});
test('linked evidence conflicts never silently overwrite either device; explicit choice is backed up', async () => {
  const server = syncServer(), { a, b } = await pair(server);
  a.storage.setItem(masteredKey, '[1]'); b.storage.setItem(masteredKey, '[2]'); await a.engine.sync(); await b.engine.sync();
  assert.equal(b.engine.status.state, 'conflict'); assert.equal(b.storage.getItem(masteredKey), '[2]');
  await b.engine.sync(true, 'remote'); assert.equal(b.storage.getItem(masteredKey), '[1]');
  const backup = JSON.parse(b.storage.getItem(SYNC_BACKUP)); assert.equal(backup.local[masteredKey], '[2]'); assert.equal(backup.remote[masteredKey], '[1]');
});
test('conflict choice expires if another device changed since the conflict was displayed', async () => {
  const server = syncServer(), { a, b } = await pair(server);
  a.storage.setItem(masteredKey, '[1]'); b.storage.setItem(masteredKey, '[2]'); await a.engine.sync(); await b.engine.sync();
  a.storage.setItem(masteredKey, '[3]'); await a.engine.sync(); await b.engine.sync(true, 'remote');
  assert.equal(b.engine.status.state, 'conflict'); assert.equal(b.storage.getItem(masteredKey), '[2]'); assert.equal(b.storage.getItem(SYNC_BACKUP), null);
});
test('local edits made while uploading remain pending and are sent on the next sync', async () => {
  const server = syncServer(), { a, b } = await pair(server); let edited = false;
  const slow = client(server, a.storage, { fetch: async (...args) => { const response = await server.fetch(...args); if (args[1]?.method === 'PUT' && !edited) { edited = true; a.storage.setItem(favoriteKey, '[1,2]'); } return response; } });
  a.storage.setItem(favoriteKey, '[1]'); await slow.engine.sync(); assert.equal(slow.engine.status.state, 'waiting');
  await slow.engine.sync(); await b.engine.sync(); assert.equal(b.storage.getItem(favoriteKey), '[1,2]');
});
test('lost upload acknowledgement is recovered without duplication or reset', async () => {
  const server = syncServer(), { a, b } = await pair(server); let lost = true;
  const unreliable = client(server, a.storage, { fetch: async (...args) => { const response = await server.fetch(...args); if (args[1]?.method === 'PUT' && lost) { lost = false; throw new TypeError('lost response'); } return response; } });
  a.storage.setItem('codewords-quiz-sessions', '7'); await unreliable.engine.sync(); assert.equal(unreliable.engine.status.state, 'error');
  await unreliable.engine.sync(); await b.engine.sync(); assert.equal(b.storage.getItem('codewords-quiz-sessions'), '7'); assert.equal(unreliable.engine.status.state, 'synced');
});
test('busy inputs and review quizzes defer incoming application even when sync is manually requested', async () => {
  const server = syncServer(), { a, b } = await pair(server); let busy = true; let applied = 0;
  const guarded = client(server, b.storage, { canApply: () => !busy, applied: () => applied++ });
  a.storage.setItem(favoriteKey, '[9]'); await a.engine.sync(); await guarded.engine.sync(true);
  assert.equal(b.storage.getItem(favoriteKey), null); assert.equal(guarded.engine.status.state, 'waiting');
  busy = false; await guarded.engine.sync(); assert.equal(b.storage.getItem(favoriteKey), '[9]'); assert.equal(applied, 1);
});
test('quota failure rolls back every key and metadata to their prior values', async () => {
  const server = syncServer(), { a, b } = await pair(server);
  a.storage.setItem(masteredKey, '[9]'); a.storage.setItem(favoriteKey, '[8]'); await a.engine.sync();
  const before = readSnapshot(b.storage), meta = b.storage.getItem(SYNC_META); b.storage.failKey = favoriteKey; await b.engine.sync();
  assert.equal(b.engine.status.state, 'error'); assert.deepEqual(readSnapshot(b.storage), before); assert.equal(b.storage.getItem(SYNC_META), meta); assert.equal(b.storage.getItem(SYNC_JOURNAL), null);
  await b.engine.sync(); assert.equal(b.storage.getItem(masteredKey), '[9]');
});
test('interrupted local transaction is recoverable after reload', () => {
  const storage = new MemoryStore(); storage.setItem(masteredKey, '[2]');
  storage.setItem(SYNC_JOURNAL, JSON.stringify({ version: 1, before: { [masteredKey]: '[1]', [favoriteKey]: null } }));
  recoverSyncJournal(storage); assert.equal(storage.getItem(masteredKey), '[1]'); assert.equal(storage.getItem(SYNC_JOURNAL), null);
});
test('unknown or corrupt local records are retained and never uploaded', async () => {
  for (const [key, raw] of [[masteredKey, 'broken'], ['codewords-daily-v1', '{"version":99}'], ['codewords-review-v1', '{"version":99,"words":{}}']]) {
    const server = syncServer(), a = client(server); a.storage.setItem(key, raw); await a.engine.connect();
    assert.equal(a.engine.status.state, 'error'); assert.equal(a.storage.getItem(key), raw); assert.equal(server.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_profiles').get().n, 0);
  }
});
test('joining a mistyped but well-formed code cannot create a new cloud record', async () => {
  const server = syncServer(), a = client(server); await a.engine.connect('f'.repeat(64));
  assert.equal(a.engine.status.state, 'error'); assert.equal(server.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_profiles').get().n, 0);
});
test('newer cloud schemas cannot replace compatible local records', async () => {
  const server = syncServer(), { a, b } = await pair(server);
  const meta = JSON.parse(a.storage.getItem(SYNC_META)), before = readSnapshot(b.storage);
  const remote = { ...meta.base, 'codewords-daily-v1': '{"version":99}' };
  assert.equal((await put(server, a.engine.code(), meta.revision, remote)).status, 200);
  await b.engine.sync(); assert.equal(b.engine.status.state, 'error'); assert.deepEqual(readSnapshot(b.storage), before);
});
test('oversized requests are rejected before database writes', async () => {
  const server = syncServer();
  const response = await server.fetch(SYNC_ENDPOINT, { method: 'PUT', headers: { Authorization: `Bearer ${'f'.repeat(64)}`, 'Content-Type': 'application/json' }, body: 'x'.repeat(8 * 1024 * 1024 + 1025) });
  assert.equal(response.status, 413); assert.equal(server.sqlite.prepare('SELECT COUNT(*) AS n FROM sync_profiles').get().n, 0);
});
test('disconnect cancels an in-flight pull without removing local progress', async () => {
  const server = syncServer(), { a, b } = await pair(server); let release;
  a.storage.setItem(masteredKey, '[3]'); await a.engine.sync();
  const paused = client(server, b.storage, { fetch: async (...args) => { await new Promise(resolve => { release = resolve; }); return server.fetch(...args); } });
  const pending = paused.engine.sync(); paused.engine.disconnect(); release(); await pending;
  assert.equal(b.storage.getItem(SYNC_META), null); assert.equal(b.storage.getItem(masteredKey), null); assert.equal(paused.engine.status.state, 'local');
});
test('API rejects missing credentials, wrong origins, methods, content types and extra keys', async () => {
  const server = syncServer(), code = 'a'.repeat(64), auth = { Authorization: `Bearer ${code}` };
  assert.equal((await server.fetch(SYNC_ENDPOINT)).status, 401);
  assert.equal((await server.fetch(SYNC_ENDPOINT, { headers: { ...auth, Origin: 'https://evil.example' } })).status, 403);
  assert.equal((await server.fetch(SYNC_ENDPOINT, { method: 'POST', headers: auth })).status, 405);
  assert.equal((await server.fetch(SYNC_ENDPOINT, { method: 'PUT', headers: auth, body: '{}' })).status, 415);
  assert.equal((await put(server, code, 0, { ...emptySnapshot(), 'codewords-voice': '"aria"' })).status, 400);
  const options = await server.fetch(SYNC_ENDPOINT, { method: 'OPTIONS', headers: { Origin: 'https://appassets.androidplatform.net' } });
  assert.equal(options.status, 204); assert.equal(options.headers.get('Access-Control-Allow-Origin'), 'https://appassets.androidplatform.net');
});
test('SQL compare-and-swap prevents stale overwrites and isolates pairing codes', async () => {
  const server = syncServer(), code = 'a'.repeat(64), first = { ...emptySnapshot(), [favoriteKey]: '[1]' };
  assert.equal((await put(server, code, 0, first)).status, 200);
  assert.equal((await put(server, code, 0, { ...first, [favoriteKey]: '[2]' })).status, 409);
  const read = await server.fetch(SYNC_ENDPOINT, { headers: { Authorization: `Bearer ${code}` } }); assert.deepEqual((await read.json()).snapshot, first);
  assert.equal((await server.fetch(SYNC_ENDPOINT, { headers: { Authorization: `Bearer ${'b'.repeat(64)}` } })).status, 404);
  assert.equal(read.headers.get('Cache-Control'), 'no-store');
});
test('large Unicode snapshots round-trip across database chunks and retain one preceding version', async () => {
  const server = syncServer(), code = 'a'.repeat(64), snapshot = { ...emptySnapshot(), [favoriteKey]: JSON.stringify('词😀'.repeat(200000)) };
  for (let revision = 0; revision < 3; revision++) assert.equal((await put(server, code, revision, snapshot)).status, 200);
  const response = await server.fetch(SYNC_ENDPOINT, { headers: { Authorization: `Bearer ${code}` } });
  assert.deepEqual((await response.json()).snapshot, snapshot);
  assert.deepEqual(server.sqlite.prepare('SELECT DISTINCT revision FROM sync_parts ORDER BY revision').all().map(row => row.revision), [2, 3]);
});
test('anonymous creation is bounded per source and cannot prevent existing records from updating', async () => {
  const server = syncServer();
  for (let index = 0; index < 5; index++) assert.equal((await put(server, index.toString(16).repeat(64), 0, emptySnapshot())).status, 200);
  assert.equal((await put(server, 'f'.repeat(64), 0, emptySnapshot())).status, 429);
  assert.equal((await put(server, '0'.repeat(64), 1, emptySnapshot())).status, 200);
});
