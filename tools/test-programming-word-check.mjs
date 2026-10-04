import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveProgrammingLessons as lessons } from '../src/programmingPractice.ts';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { createDailyProgress, createDailySession, updateDailyDraft, submitDailyAnswer, parseDailyProgress, markDailyHelp } from '../src/dailyProgress.ts';
import { previewAdaptiveScope, planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession, hasAdaptiveContent, reconcileSavedQuestion } from '../src/adaptiveLearning.ts';
import { mergeProgrammingCourse } from '../src/programmingProgress.ts';
import { applyProgrammingReviewToLearning, programmingReview } from '../src/programmingReview.ts';
import { isReviewEligible, getSkill, updateReviewProgress } from '../src/review.ts';
import { courseOverview } from '../src/courseOverviewData.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { validateProgressSnapshot } from '../src/syncValidation.ts';
import { emptySnapshot } from '../src/syncProtocol.ts';

const now = 1791000000000;
const copy = value => structuredClone(value);
const tasks = lessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice]);
const current = progress => tasks.find(task => task.id === progress.session.queue[progress.session.index].exerciseId);
function start(progress = createDailyProgress(), seed = .37) {
  return { ...progress, session: planAdaptiveSession(progress, lessons, now, () => seed) };
}
function answer(progress, outcome = 'correct') {
  const task = current(progress);
  let draft = correctDraft(task);
  if (outcome === 'wrong') draft = task.kind === 'fill' ? { blanks: ['zzzz'] } : { choice: task.options.find(option => !task.answers.includes(option)) };
  progress = { ...progress, session: updateDailyDraft(progress.session, draft) };
  const lesson = resolveAdaptiveLesson(progress.session, lessons);
  if (outcome === 'helped') progress = recordAdaptiveAnswer(markDailyHelp(progress, lesson, false, now), lessons, now);
  return recordAdaptiveAnswer(submitDailyAnswer(progress, lesson, {}, now + progress.session.index * 1000), lessons, now);
}
function round(progress, outcome = 'correct') {
  progress = beginAdaptiveLearning(progress, lessons, now);
  while (progress.session.stage === 'exercise') {
    const before = progress.session.answers.length;
    progress = answer(progress, typeof outcome === 'function' ? outcome(before) : outcome);
    assert.ok(progress.session.feedback);
    const reload = parseDailyProgress(JSON.stringify(progress), lessons);
    assert.equal(reload.writable, true, reload.warning);
    const next = advanceAdaptiveSession(progress, lessons, now);
    assert.deepEqual(advanceAdaptiveSession(reload.progress, lessons, now), next, 'refresh must retain the question and random state');
    progress = next;
    assert.ok(progress.session.answers.length <= 10);
  }
  return progress;
}

test('new course previews six unintroduced words and a ten-question check without enrolling them', () => {
  const progress = createDailyProgress();
  const original = JSON.stringify(progress);
  const scope = previewAdaptiveScope(progress, lessons);
  assert.equal(scope.focusIds.length, 6);
  assert.deepEqual(scope.focusIds, scope.newIds);
  assert.equal(scope.budget, 10);
  assert.equal(scope.courseMode, 'word-check');
  assert.equal(courseOverview(progress, lessons).targets.length, 6);
  const session = start(progress).session;
  assert.equal(session.stage, 'study');
  assert.equal(resolveAdaptiveLesson(session, lessons).phrases.filter(phrase => phrase.id.startsWith('word-')).length, 6);
  assert.equal(JSON.stringify(progress), original);
  const taught = beginAdaptiveLearning({ ...progress, session }, lessons, now);
  assert.equal(Object.keys(taught.learning.targets).length, 6);
  assert.equal(taught.session.answers.length, 0);
  assert.ok(Object.values(taught.learning.targets).every(target => target.confidence === 0 && target.readyAt === 0));
});

for (const outcome of ['correct', 'wrong', 'helped']) test(`${outcome}: ten actual checks cover all six words, with no speech and at most one input`, () => {
  for (const seed of [.01, .19, .37, .51, .79, .99]) {
    const progress = round(start(createDailyProgress(), seed), outcome);
    assert.equal(progress.session.answers.length, 10);
    assert.equal(progress.session.adaptive.budget, 10);
    const checked = progress.session.queue.map(entry => tasks.find(task => task.id === entry.exerciseId));
    assert.ok(checked.every(task => ['choice', 'fill'].includes(task.kind)));
    assert.ok(checked.filter(task => task.kind === 'fill').length <= 1);
    const covered = new Set(checked.flatMap(task => task.knowledgeIds));
    assert.deepEqual([...covered].sort(), [...progress.session.adaptive.focusIds].sort());
    assert.ok(checked.every(task => task.knowledgeIds.every(id => progress.session.adaptive.focusIds.includes(id))));
    assert.equal(new Set(checked.map(task => task.learningSignature)).size, checked.length, 'changing an authored range must not duplicate a question');
    const next = previewAdaptiveScope(progress, lessons);
    assert.equal(next.newIds.length, 6);
    assert.ok(next.newIds.every(id => !covered.has(id) && !progress.learning.targets[id]));
  }
});

test('all actual programming words advance once even after every answer is wrong; the final small batch stays short', () => {
  let progress = createDailyProgress(), covered = new Set(), rounds = 0;
  const expected = new Set(lessons.flatMap(lesson => lesson.learningTargets));
  while (hasAdaptiveContent(progress, lessons)) {
    progress = start(progress);
    const ids = progress.session.adaptive.focusIds;
    assert.deepEqual(ids, progress.session.adaptive.newIds);
    assert.ok(ids.length > 0 && ids.length <= 6);
    for (const id of ids) { assert.equal(covered.has(id), false, `${id} was sent back to a new lesson`); covered.add(id); }
    progress = round(progress, 'wrong');
    assert.equal(progress.session.answers.length, Math.min(10, ids.length * 2));
    assert.ok(++rounds <= Math.ceil(expected.size / 6));
  }
  assert.deepEqual([...covered].sort(), [...expected].sort());
  assert.equal(planAdaptiveSession(progress, lessons, now), null);
  assert.ok(Object.values(progress.learning.targets).every(target => target.readyAt === 0));
});

test('review keeps taught words available for point reading without fabricating mastery or other skills', () => {
  let progress = beginAdaptiveLearning(start(), lessons, now);
  let review = mergeProgrammingCourse({}, progress, lessons, now);
  for (const id of progress.session.adaptive.focusIds) {
    const wordId = Number(id.replace('word-', ''));
    assert.ok(isReviewEligible(review, wordId));
    assert.equal(progress.learning.targets[id].readyAt, 0);
    for (const ability of ['meaning', 'context', 'spelling', 'listening']) assert.equal(getSkill(review, wordId, ability).attempts ?? 0, 0);
  }
  progress = answer(progress, 'wrong');
  review = mergeProgrammingCourse(review, progress, lessons, now);
  assert.deepEqual(mergeProgrammingCourse(review, progress, lessons, now), review, 'reloading must not count an answer twice');
  const task = current(progress), wordId = task.wordIds[0];
  assert.equal(getSkill(review, wordId, task.ability).incorrectAnswers, 1);
  assert.equal(getSkill(review, wordId, 'spelling').attempts ?? 0, 0);
});

test('a later review failure does not change course targets, skips or the next new-word batch', () => {
  const progress = round(start());
  let review = mergeProgrammingCourse({}, progress, lessons, now);
  const wordId = Number(progress.session.adaptive.focusIds[0].replace('word-', ''));
  review = updateReviewProgress(review, { wordId, ability: 'meaning', level: 0, retry: false, source: 'review' }, 'revealed', now + 86400000);
  const before = JSON.stringify(progress);
  const prepared = applyProgrammingReviewToLearning(progress, review);
  assert.deepEqual(prepared, progress);
  assert.equal(JSON.stringify(progress), before);
  assert.deepEqual(previewAdaptiveScope(prepared, lessons), previewAdaptiveScope(progress, lessons));
});

test('retained course review words count as previous exposure when the course record is missing', () => {
  const taught = beginAdaptiveLearning(start(), lessons, now);
  const review = mergeProgrammingCourse({}, taught, lessons, now);
  const prepared = applyProgrammingReviewToLearning(createDailyProgress(), review);
  for (const id of taught.session.adaptive.focusIds) {
    assert.equal(prepared.learning.targets[id].introducedAt, now);
    assert.equal(prepared.learning.targets[id].readyAt, 0);
    assert.equal(prepared.learning.targets[id].confidence, 0);
    assert.deepEqual(prepared.learning.targets[id].abilities, {});
  }
  assert.ok(previewAdaptiveScope(prepared, lessons).newIds.every(id => !taught.session.adaptive.focusIds.includes(id)));
  assert.deepEqual(applyProgrammingReviewToLearning(prepared, review), prepared);
});

test('taught scene review remains usable without requiring fabricated target mastery', () => {
  const taught = beginAdaptiveLearning(start(), lessons, now);
  const planner = programmingReview(mergeProgrammingCourse({}, taught, lessons, now), now);
  assert.equal(planner.reviewable(taught, lessons[0]), true);
  assert.equal(planner.reviewable(createDailyProgress(), lessons[0]), false);
  assert.ok(planner.session(lessons[0], 'meaning').queue.length);
  assert.ok(Object.values(taught.learning.targets).every(target => target.readyAt === 0));
});

test('pre-adaptive programming study resumes through the direct check without losing its old draft', () => {
  const progress = createDailyProgress();
  progress.session = createDailySession(lessons[3], 'lesson', now);
  progress.session.draft.text = 'retained pre-adaptive study draft';
  const original = copy(progress);
  const migrated = reconcileSavedQuestion(progress, lessons, now);
  assert.deepEqual(progress, original);
  assert.equal(migrated.session.id, original.session.id);
  assert.equal(migrated.session.adaptive.focusIds.length, 6);
  assert.equal(migrated.session.adaptive.budget, 10);
  assert.equal(migrated.session.answers.length, 0);
  assert.equal(migrated.session.replaced[0].draft.text, original.session.draft.text);
  assert.equal(migrated.session.replaced[0].exerciseId, original.session.queue[0].exerciseId);
  assert.equal(parseDailyProgress(JSON.stringify(migrated), lessons).writable, true);
  assert.deepEqual(reconcileSavedQuestion(migrated, lessons, now + 1000), migrated);
  const started = beginAdaptiveLearning(migrated, lessons, now);
  assert.equal(started.session.stage, 'exercise');
  assert.deepEqual(started.session.queue, migrated.session.queue);
  assert.equal(Object.keys(started.learning.targets).length, 6);
});

test('legacy study sessions adopt the six-new-word scope while preserving the original draft', () => {
  const oldLessons = lessons.map(({ courseMode, ...lesson }) => lesson);
  const progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, oldLessons, now, () => .37);
  progress.session.draft.text = 'retained old study draft';
  const migrated = reconcileSavedQuestion(progress, lessons, now);
  assert.equal(migrated.session.id, progress.session.id);
  assert.equal(migrated.session.adaptive.focusIds.length, 6);
  assert.equal(migrated.session.adaptive.budget, 10);
  assert.equal(migrated.session.replaced[0].draft.text, 'retained old study draft');
  assert.deepEqual(reconcileSavedQuestion(migrated, lessons, now + 1000), migrated);
  assert.equal(parseDailyProgress(JSON.stringify(migrated), lessons).writable, true);
});

test('a saved oral question is replaced once and its transcript remains available in the saved record', () => {
  const oldLessons = lessons.map(({ courseMode, ...lesson }) => lesson);
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, oldLessons, now, () => .37);
  progress = beginAdaptiveLearning(progress, oldLessons, now);
  assert.equal(current(progress).kind, 'speak');
  progress.session.draft.speech = { mode: 'read', transcripts: { retained: 'original transcript' } };
  const migrated = reconcileSavedQuestion(progress, lessons, now);
  assert.equal(current(migrated).kind, 'choice');
  assert.equal(migrated.session.replaced[0].draft.speech.transcripts.retained, 'original transcript');
  assert.equal(migrated.session.answers.length, 0);
  assert.deepEqual(reconcileSavedQuestion(migrated, lessons, now + 1000), migrated);
  assert.equal(parseDailyProgress(JSON.stringify(migrated), lessons).writable, true);
});

test('a valid draft in an already-started old lesson stays in place during migration', () => {
  const oldLessons = lessons.map(({ courseMode, ...lesson }) => lesson);
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, oldLessons, now, () => .37);
  progress = beginAdaptiveLearning(progress, oldLessons, now);
  const task = tasks.find(task => task.kind === 'choice' && task.ability === 'meaning'
    && task.knowledgeIds.every(id => progress.session.adaptive.focusIds.includes(id))
    && (task.prerequisiteIds ?? []).every(id => progress.learning.targets[id]));
  progress.session = { ...progress.session, queue: [{ exerciseId: task.id, retry: false }], draft: correctDraft(task) };
  const migrated = reconcileSavedQuestion(progress, lessons, now);
  assert.deepEqual(migrated.session.draft, progress.session.draft);
  assert.deepEqual(migrated.session.queue, progress.session.queue);
  assert.equal(migrated.session.answers.length, 0);
  assert.deepEqual(reconcileSavedQuestion(migrated, lessons, now + 1000), migrated);
});

test('an old round with ten completed answers ends without one extra mandatory question', () => {
  const oldLessons = lessons.map(({ courseMode, ...lesson }) => lesson);
  let progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, oldLessons, now, () => .37);
  progress = beginAdaptiveLearning(progress, oldLessons, now);
  for (let index = 0; index < 10; index++) {
    const task = current(progress);
    progress.session = updateDailyDraft(progress.session, correctDraft(task));
    progress = recordAdaptiveAnswer(submitDailyAnswer(progress, resolveAdaptiveLesson(progress.session, oldLessons), {}, now + index * 1000), oldLessons, now + index * 1000);
    progress = advanceAdaptiveSession(progress, oldLessons, now + index * 1000);
  }
  assert.equal(progress.session.stage, 'exercise');
  progress.session.draft.text = 'retained unfinished answer';
  const migrated = reconcileSavedQuestion(progress, lessons, now + 20000);
  assert.equal(migrated.session.stage, 'summary');
  assert.deepEqual(migrated.session.answers, progress.session.answers);
  assert.equal(migrated.session.replaced.at(-1).draft.text, 'retained unfinished answer');
  assert.equal(parseDailyProgress(JSON.stringify(migrated), lessons).writable, true);
});

test('current answers and drafts survive parsing and sync validation; daily course policy remains adaptive', () => {
  const progress = answer(beginAdaptiveLearning(start(), lessons, now), 'wrong');
  const original = JSON.stringify(progress);
  assert.deepEqual(parseDailyProgress(original, lessons).progress, progress);
  validateProgressSnapshot({ ...emptySnapshot(), 'codewords-programming-course-v1': original });
  const invalid = copy(progress); invalid.session.adaptive.courseMode = 'unrecognized';
  assert.equal(parseDailyProgress(JSON.stringify(invalid), lessons).writable, false);
  const daily = planAdaptiveSession(createDailyProgress(), adaptiveDailyLessons, now, () => .37);
  assert.equal(daily.adaptive.courseMode, undefined);
  assert.equal(resolveAdaptiveLesson(daily, adaptiveDailyLessons).exercises.find(task => task.id === daily.queue[0].exerciseId).kind, 'speak');
});
