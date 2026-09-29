import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveProgrammingLessons as lessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailySession, updateDailyDraft, checkDailyAttempt, updateDailyPairs, parseDailyProgress } from '../src/dailyProgress.ts';
import { selectPair } from '../src/pairPractice.ts';
import { ProgressSync } from '../src/progressSync.ts';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';

const key = 'codewords-programming-course-v1', now = 1800000000000;
function fixture(predicate) {
  const source = lessons.find(lesson => lesson.practice.some(predicate)), task = source.practice.find(predicate);
  const progress = createDailyProgress();
  progress.session = { ...createDailySession({ ...source, exercises: [task] }, 'review', now), focused: true };
  return { progress, task, lesson: source };
}
function client(server) { const storage = new MemoryStore(), engine = new ProgressSync({ storage, fetch: server.fetch, validate: validateProgressSnapshot }); engine.initialize(); return { storage, engine }; }

for (const kind of ['correction', 'pairs']) test(`${kind} survives two-client synchronization before and after submission`, async () => {
  const server = syncServer(), a = client(server), b = client(server);
  let { progress, task, lesson } = fixture(task => kind === 'pairs' ? task.kind === 'match' : task.kind === 'fill' && task.blanks[0][0].length >= 5);
  if (kind === 'correction') {
    progress.session = updateDailyDraft(progress.session, { blanks: [task.blanks[0][0].slice(0, -1) + 'z'] });
    progress = checkDailyAttempt(progress, lesson, now);
    assert.ok(progress.session.draft.correction);
  } else {
    progress.session = updateDailyDraft(progress.session, { pairs: selectPair(progress.session.draft.pairs, task.pairs[0].id) });
    progress = updateDailyPairs(progress, lesson, task.pairs[1].id, now);
  }
  a.storage.setItem(key, JSON.stringify(progress)); await a.engine.connect(); await b.engine.connect(a.engine.code());
  assert.equal(b.engine.status.state, 'synced'); assert.deepEqual(JSON.parse(b.storage.getItem(key)), progress);
  progress = parseDailyProgress(b.storage.getItem(key), lessons).progress;
  if (kind === 'correction') progress.session = updateDailyDraft(progress.session, { blanks: task.blanks.map(options => options[0]) });
  else for (const item of task.pairs) if (!progress.session.draft.pairs.matches[item.id]) {
    progress.session = updateDailyDraft(progress.session, { pairs: selectPair(progress.session.draft.pairs, item.id) });
    progress = updateDailyPairs(progress, lesson, item.id, now + 1000);
  }
  progress = checkDailyAttempt(progress, lesson, now + 1000); b.storage.setItem(key, JSON.stringify(progress));
  await b.engine.sync(); await a.engine.sync(); assert.equal(a.engine.status.state, 'synced');
  const restored = parseDailyProgress(a.storage.getItem(key), lessons); assert.equal(restored.writable, true, restored.warning);
  assert.equal(restored.progress.session.answers.length, 1); assert.equal(restored.progress.session.answers[0].outcome, 'assisted');
  assert.deepEqual(restored.progress, progress);
  assert.equal(a.storage.getItem('codewords-daily-v1'), null);
});
