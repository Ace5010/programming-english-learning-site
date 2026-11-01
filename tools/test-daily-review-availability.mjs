import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveDailyLessons as lessons } from '../src/dailyPractice.ts';
import { createDailyProgress, dailyKnowledgeAvailable, dailyKnowledgeReviewable, dailyLessonReviewable, createDailyReviewSession, dailyExerciseKnowledgeIds, parseDailyProgress, dueDailyLessons } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning, skipAdaptiveCourse, undoCourseSkip, resolveAdaptiveLesson, recordAdaptiveAnswer } from '../src/adaptiveLearning.ts';
import { submitDailyAnswer, updateDailyDraft } from '../src/dailyProgress.ts';
import { correctDraft } from './helpers/course-answer.mjs';

const now = 1800000000000;
function start() {
  const progress = createDailyProgress();
  return { ...progress, session: planAdaptiveSession(progress, lessons, now, () => .37) };
}
for (const action of ['taught', 'skipped']) test(`${action}: browsing and voluntary practice do not require readiness or fabricate results`, () => {
  const before = start(), ids = before.session.adaptive.focusIds;
  const progress = action === 'taught' ? beginAdaptiveLearning(before, lessons, now) : skipAdaptiveCourse(before, lessons, now, () => .37);
  const snapshot = JSON.stringify(progress);
  for (const id of ids) {
    assert.equal(dailyKnowledgeAvailable(progress, id), true);
    assert.equal(dailyKnowledgeReviewable(progress, id), false);
  }
  assert.equal(dailyKnowledgeAvailable(progress, 'daily-word-unknown'), false);
  const source = lessons.find(item => item.id === before.session.lessonId);
  assert.equal(dailyLessonReviewable(progress, source), true);
  const review = createDailyReviewSession(progress, source, 'auto', now);
  assert.ok(review.queue.length);
  for (const entry of review.queue) {
    const task = [...source.exercises, ...source.practice].find(item => item.id === entry.exerciseId);
    assert.ok(dailyExerciseKnowledgeIds(source, task).every(id => ids.includes(id)));
    assert.ok((task.prerequisiteIds ?? []).every(id => dailyKnowledgeAvailable(progress, id)));
  }
  assert.deepEqual(dueDailyLessons(progress, lessons, now), []);
  assert.equal(JSON.stringify(progress), snapshot);
  assert.equal(parseDailyProgress(JSON.stringify({ ...progress, session: review }), lessons).writable, true);
  const restored = parseDailyProgress(snapshot, lessons).progress;
  for (const id of ids) assert.equal(dailyKnowledgeAvailable(restored, id), true);
  if (action === 'skipped') {
    const undone = undoCourseSkip(progress);
    for (const id of ids) assert.equal(dailyKnowledgeAvailable(undone, id), false);
  }
  let practice = { ...progress, session: { ...review, stage: 'exercise' } };
  const task = resolveAdaptiveLesson(practice.session, lessons).exercises.find(item => item.id === review.queue[0].exerciseId);
  practice = { ...practice, session: updateDailyDraft(practice.session, correctDraft(task)) };
  practice = recordAdaptiveAnswer(submitDailyAnswer(practice, source, {}, now + 1000), lessons, now + 1000);
  assert.ok(practice.session.answers.length);
  assert.ok(practice.knowledge[dailyExerciseKnowledgeIds(source, task)[0]]);
  assert.equal(parseDailyProgress(JSON.stringify(practice), lessons).writable, true);
});

test('historical knowledge stays visible without rewriting its learning evidence', () => {
  const progress = beginAdaptiveLearning(start(), lessons, now);
  const id = progress.session.adaptive.focusIds[0];
  delete progress.learning.targets[id];
  const snapshot = JSON.stringify(progress);
  assert.equal(dailyKnowledgeAvailable(progress, id), true);
  assert.equal(JSON.stringify(progress), snapshot);
});
