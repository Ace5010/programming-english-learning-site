import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailyProgress, createDailyDraft, parseDailyProgress, updateDailyDraft, checkDailyAttempt, submitDailyAnswer, dailyKnowledgeReviewable } from '../src/dailyProgress.ts';
import { planAdaptiveSession, resolveAdaptiveLesson, beginAdaptiveLearning, skipAdaptiveCourse, canUndoCourseSkip, undoCourseSkip, restoreSkippedTarget, hasAdaptiveContent, recordAdaptiveAnswer, reconcileSavedQuestion } from '../src/adaptiveLearning.ts';
import { applyProgrammingReviewToLearning } from '../src/programmingReview.ts';
import { enrollWord, updateReviewProgress } from '../src/review.ts';
import { ProgressSync } from '../src/progressSync.ts';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { syncServer, MemoryStore } from './sync-test-server.mjs';
import { correctDraft } from './helpers/course-answer.mjs';

const now = 1800000000000, random = () => .37;
const copy = value => JSON.parse(JSON.stringify(value));
function start(lessons) {
  const progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, lessons, now, random);
  assert.ok(progress.session);
  return progress;
}
function restored(progress, lessons) {
  const parsed = parseDailyProgress(JSON.stringify(progress), lessons);
  assert.equal(parsed.writable, true, parsed.warning);
  return parsed.progress;
}
function task(progress, lessons) {
  return resolveAdaptiveLesson(progress.session, lessons).exercises.find(item => item.id === progress.session.queue[progress.session.index].exerciseId);
}
function client(server) {
  const storage = new MemoryStore(), engine = new ProgressSync({ storage, fetch: server.fetch, validate: validateProgressSnapshot });
  engine.initialize(); return { storage, engine };
}

for (const [name, lessons, key] of [
  ['daily', adaptiveDailyLessons, 'codewords-daily-v1'],
  ['programming', adaptiveProgrammingLessons, 'codewords-programming-course-v1'],
]) {
  test(`${name}: skipping changes only self-declared familiarity and the next study round`, () => {
    const before = start(lessons), original = copy(before), focus = before.session.adaptive.focusIds;
    const next = skipAdaptiveCourse(before, lessons, now + 1, random);
    assert.deepEqual(before, original, 'input stays immutable');
    assert.deepEqual(Object.keys(next.learning.selfKnown).sort(), [...focus].sort());
    assert.deepEqual(next.learning.targets, {});
    assert.equal(next.learning.turns, 0); assert.equal(next.learning.rounds, 0);
    for (const field of ['knowledge', 'lessons', 'favorites']) assert.deepEqual(next[field], before[field]);
    assert.ok(next.session && next.session.stage === 'study');
    assert.ok(next.session.adaptive.focusIds.every(id => !focus.includes(id)));
    const question = task(next, lessons);
    assert.ok(question.knowledgeIds.every(id => !next.learning.selfKnown[id]), 'skipped targets are not automatically tested');
    assert.ok((question.prerequisiteIds ?? []).every(id => next.learning.targets[id]?.introducedAt || next.learning.selfKnown[id] || next.session.adaptive.newIds.includes(id)));
    assert.deepEqual(reconcileSavedQuestion(next, lessons, now + 3), next, 'declared prerequisite survives refresh without reshuffling');
    assert.deepEqual(restored(next, lessons), copy(next));
    assert.deepEqual(undoCourseSkip(restored(next, lessons)), original);
    assert.equal(dailyKnowledgeReviewable(next, focus[0]), false, 'self-report does not grant review');
  });

  test(`${name}: undo preserves favorites and is unavailable after practice starts`, () => {
    const before = start(lessons), next = skipAdaptiveCourse(before, lessons, now + 1, random);
    const favorite = lessons[0].phrases[0].id;
    const edited = { ...next, favorites: [favorite], revision: 12 };
    const undone = undoCourseSkip(edited);
    assert.deepEqual(undone.session, before.session);
    assert.deepEqual(undone.favorites, [favorite]); assert.equal(undone.revision, 12);
    const begun = beginAdaptiveLearning(next, lessons, now + 2);
    assert.equal(canUndoCourseSkip(begun), false); assert.equal(begun.skipUndo, undefined);
    assert.strictEqual(undoCourseSkip(begun), begun);
    assert.strictEqual(skipAdaptiveCourse(begun, lessons), begun);
    assert.strictEqual(skipAdaptiveCourse({ ...before, session: { ...before.session, mode: 'review' } }, lessons).learning, before.learning);
    assert.equal(canUndoCourseSkip({ ...next, session: { ...next.session, id: 'different-session' } }), false);
  });

  test(`${name}: all available content can be skipped finitely and restored without fake completion`, () => {
    let progress = start(lessons), count = 0;
    const all = [...new Set(lessons.filter(item => !item.referenceOnly).flatMap(item => item.learningTargets))];
    while (progress.session) {
      assert.ok(++count <= all.length, 'each skip makes forward progress');
      const before = Object.keys(progress.learning?.selfKnown ?? {}).length;
      progress = restored(skipAdaptiveCourse(progress, lessons, now + count, random), lessons);
      assert.ok(Object.keys(progress.learning.selfKnown).length > before);
    }
    assert.equal(hasAdaptiveContent(progress, lessons), false);
    assert.ok(all.every(id => progress.learning.selfKnown[id]));
    assert.deepEqual(progress.knowledge, createDailyProgress().knowledge); assert.deepEqual(progress.lessons, {});
    assert.deepEqual(progress.learning.targets, {}); assert.equal(progress.learning.rounds, 0); assert.equal(progress.learning.turns, 0);
    assert.equal(canUndoCourseSkip(progress), true);
    assert.ok(undoCourseSkip(progress).session);
    const returned = restoreSkippedTarget(progress, all[0]);
    assert.equal(returned.learning.selfKnown[all[0]], undefined); assert.equal(returned.skipUndo, undefined);
    assert.equal(hasAdaptiveContent(returned, lessons), true);
    assert.ok(planAdaptiveSession(returned, lessons, now + 999, random).adaptive.focusIds.includes(all[0]));
    assert.strictEqual(restoreSkippedTarget(returned, all[0]), returned);
    for (const id of Object.keys(progress.learning.selfKnown)) {
      const one = restoreSkippedTarget(progress, id);
      assert.ok(planAdaptiveSession(one, lessons, now + 1000, random)?.adaptive.focusIds.includes(id), `${id} can independently rejoin the course`);
    }
  });

  test(`${name}: previous evidence survives skip and follows its course's recovery policy`, () => {
    let before = beginAdaptiveLearning(start(lessons), lessons, now);
    const first = task(before, lessons);
    before.session = updateDailyDraft(before.session, correctDraft(first));
    before = recordAdaptiveAnswer(submitDailyAnswer(before, resolveAdaptiveLesson(before.session, lessons), {}, now + 1), lessons, now + 1);
    before.session = null; before.session = planAdaptiveSession(before, lessons, now + 2, random);
    const after = skipAdaptiveCourse(before, lessons, now + 3, random);
    assert.deepEqual(after.learning.targets, before.learning.targets);
    assert.deepEqual(after.knowledge, before.knowledge); assert.deepEqual(after.lessons, before.lessons);
    if (name === 'programming') {
      const introduced = new Set(Object.keys(before.learning.targets));
      assert.ok(before.session.adaptive.focusIds.every(id => !introduced.has(id)));
      const next = planAdaptiveSession({ ...after, session: null }, lessons, now + 5, random);
      assert.ok(next.adaptive.focusIds.every(id => !introduced.has(id) && !after.learning.selfKnown[id]));
      assert.deepEqual(next.adaptive.focusIds, next.adaptive.newIds);
      return;
    }
    const id = before.session.adaptive.focusIds.find(id => before.learning.targets[id] && (id.startsWith('word-') || id.startsWith('daily-word-')))
      ?? before.session.adaptive.focusIds.find(id => before.learning.targets[id]);
    assert.ok(id);
    // Explicit review of an already introduced target is a real test, not a skip.
    const question = lessons.flatMap(l => l.practice).find(item => item.kind !== 'speak' && item.knowledgeIds?.includes(id));
    assert.ok(question);
    let measured = { ...after, session: { ...before.session, stage: 'exercise', queue: [{ exerciseId: question.id, retry: false }], draft: createDailyDraft(question), feedback: null } };
    const resolved = resolveAdaptiveLesson(measured.session, lessons);
    measured = submitDailyAnswer(measured, resolved, { reveal: true }, now + 4);
    measured = recordAdaptiveAnswer(measured, lessons, now + 4);
    assert.equal(measured.learning.selfKnown[id], undefined);
    assert.equal(measured.skipUndo, undefined, 'a new measured event invalidates the old undo snapshot');
    assert.ok(measured.learning.targets[id].lastFailureTurn > 0);
    assert.equal(undoCourseSkip(measured), measured);
    const round = planAdaptiveSession({ ...measured, session: null }, lessons, now + 5, random);
    assert.ok(round.adaptive.focusIds.includes(id));
  });

  test(`${name}: skip, undo and restore survive two-client sync without leaking into the other section`, async () => {
    const server = syncServer(), a = client(server), b = client(server);
    const before = start(lessons), skipped = skipAdaptiveCourse(before, lessons, now + 1, random);
    a.storage.setItem(key, JSON.stringify(skipped));
    await a.engine.connect(); await b.engine.connect(a.engine.code());
    assert.equal(b.engine.status.state, 'synced');
    assert.deepEqual(restored(JSON.parse(b.storage.getItem(key)), lessons), copy(skipped));
    let next = undoCourseSkip(JSON.parse(b.storage.getItem(key)));
    b.storage.setItem(key, JSON.stringify(next)); await b.engine.sync(); await a.engine.sync();
    assert.equal(a.engine.status.state, 'synced');
    assert.deepEqual(JSON.parse(a.storage.getItem(key)), copy(before));
    next = skipAdaptiveCourse(next, lessons, now + 2, random);
    next = restoreSkippedTarget(next, before.session.adaptive.focusIds[0]);
    a.storage.setItem(key, JSON.stringify(next)); await a.engine.sync(); await b.engine.sync();
    assert.deepEqual(JSON.parse(b.storage.getItem(key)), copy(next));
    assert.equal(b.storage.getItem(name === 'daily' ? 'codewords-programming-course-v1' : 'codewords-daily-v1'), null);
  });
}

test('malformed optional skip data is retained read-only instead of overwriting old records', () => {
  const progress = skipAdaptiveCourse(start(adaptiveDailyLessons), adaptiveDailyLessons, now, random);
  for (const mutate of [
    p => p.learning.selfKnown = { hello: -1 },
    p => p.learning.selfKnown = [],
    p => p.skipUndo.session.stage = 'exercise',
    p => p.skipUndo.session.mode = 'review',
    p => p.skipUndo.nextSessionId = 4,
    p => p.skipUndo.learning = { version: 99 },
  ]) {
    const broken = copy(progress); mutate(broken); const raw = JSON.stringify(broken);
    const parsed = parseDailyProgress(raw, adaptiveDailyLessons);
    assert.equal(parsed.writable, false); assert.equal(parsed.raw, raw);
  }
  assert.equal(parseDailyProgress(JSON.stringify(createDailyProgress()), adaptiveDailyLessons).writable, true);
});

test('programming review failure preserves existing skip records and never reopens taught course words', () => {
  let course = beginAdaptiveLearning(start(adaptiveProgrammingLessons), adaptiveProgrammingLessons, now);
  const id = course.session.adaptive.focusIds[0], wordId = Number(id.replace('word-', ''));
  course.session = null; course.session = planAdaptiveSession(course, adaptiveProgrammingLessons, now + 1, random);
  course = skipAdaptiveCourse(course, adaptiveProgrammingLessons, now + 2, random);
  // Older records may declare an already-taught word familiar too.
  course.learning.selfKnown = { ...course.learning.selfKnown, [id]: now };
  assert.ok(course.learning.selfKnown[id]);
  let review = enrollWord({}, wordId, 'course', now);
  review = updateReviewProgress(review, { wordId, ability: 'meaning', level: 0, retry: false }, 'revealed', now + 3);
  const next = applyProgrammingReviewToLearning(course, review);
  assert.deepEqual(next, course);
  assert.ok(next.learning.selfKnown[id]);
  assert.ok(next.skipUndo);
  const planned = planAdaptiveSession({ ...next, session: null }, adaptiveProgrammingLessons, now + 4, random);
  assert.ok(!planned.adaptive.focusIds.includes(id));
});

test('a reliable sentence typo brings an unintroduced skipped pilot word back, once', () => {
  const lessons = adaptiveDailyLessons;
  let progress = start(lessons), n = 0;
  while (progress.session) progress = skipAdaptiveCourse(progress, lessons, now + ++n, random);
  progress = restoreSkippedTarget(progress, 'from-china');
  progress.session = planAdaptiveSession(progress, lessons, now + 100, random);
  progress = beginAdaptiveLearning(progress, lessons, now + 100);
  assert.ok(progress.learning.selfKnown['daily-word-from']);
  assert.equal(progress.learning.targets['daily-word-from'], undefined);
  const question = lessons.flatMap(l => l.practice).find(q => q.id.endsWith('-from-china-write'));
  assert.ok(question);
  progress.session = { ...progress.session, queue: [{ exerciseId: question.id, retry: false }], draft: { ...createDailyDraft(question), text: 'I am form China.' } };
  const lesson = resolveAdaptiveLesson(progress.session, lessons);
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now + 101), lessons, now + 101);
  assert.equal(progress.learning.selfKnown['daily-word-from'], undefined);
  assert.equal(progress.learning.targets['daily-word-from'].lastErrorAbility, 'spelling');
  assert.equal(progress.learning.targets['daily-word-from'].readyAt, 0);
  const errorTarget = copy(progress.learning.targets['daily-word-from']);
  progress = restored(progress, lessons);
  progress.session = updateDailyDraft(progress.session, { text: 'I am from China.' });
  progress = recordAdaptiveAnswer(checkDailyAttempt(progress, lesson, now + 102), lessons, now + 102);
  assert.deepEqual(progress.learning.targets['daily-word-from'], errorTarget, 'correction cannot penalize the word again');
  const next = planAdaptiveSession({ ...progress, session: null }, lessons, now + 103, random);
  assert.ok(next.adaptive.focusIds.includes('daily-word-from'));
});
