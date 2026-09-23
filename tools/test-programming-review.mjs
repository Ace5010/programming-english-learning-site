import test from 'node:test';
import assert from 'node:assert/strict';
import { programmingReview } from '../src/programmingReview.ts';
import { programmingLessons } from '../src/programmingCourse.ts';
import { createDailyProgress, learnDailyLesson, parseDailyProgress, createDailySession, beginDailyExercises, updateDailyDraft, submitDailyAnswer } from '../src/dailyProgress.ts';
import { enrollWord, getSkill, reviewAbilities, updateReviewProgress } from '../src/review.ts';

const at = day => new Date(2026, 8, day, 10).getTime();
const lesson = programmingLessons[0];
function future() {
  let progress = {};
  for (const id of lesson.wordIds) progress = enrollWord(progress, id, 'course', at(22));
  return progress;
}

test('scene choice questions use context separately from meaning and order does not imply spelling', () => {
  const planner = programmingReview(future(), at(22));
  assert.equal(planner.ability(lesson.exercises.find(exercise => exercise.ability === 'context')), 'context');
  for (const current of programmingLessons) for (const exercise of current.exercises) assert.equal(planner.ability(exercise), exercise.ability);
  const meaning = planner.session(lesson, 'meaning');
  assert.ok(meaning.queue.length);
  assert.ok(meaning.queue.every(entry => lesson.exercises.find(exercise => exercise.id === entry.exerciseId).ability === 'meaning'));
});

test('scene scheduling immediately reflects correction in shared word skills', () => {
  const task = lesson.exercises.find(exercise => exercise.ability === 'context');
  let words = future();
  for (const id of task.wordIds) words = updateReviewProgress(words, { wordId: id, ability: 'context', level: 0, retry: false }, 'revealed', at(22));
  const course = learnDailyLesson(createDailyProgress(), lesson, at(22));
  let planner = programmingReview(words, at(22));
  assert.ok(planner.difficulties(lesson).includes(task.id));
  assert.ok(planner.session(lesson, 'auto').queue.every(entry => lesson.exercises.find(exercise => exercise.id === entry.exerciseId).ability === 'context'));
  // Later independent word recall clears only this ability. Scene planning reads it directly.
  for (const id of task.wordIds) words = updateReviewProgress(words, { wordId: id, ability: 'context', level: 0, retry: false }, 'independent', at(23));
  planner = programmingReview(words, at(23));
  assert.equal(planner.difficulties(lesson).includes(task.id), false);
  assert.ok(!planner.session(lesson, 'auto').queue.some(entry => entry.exerciseId === task.id));
  assert.equal(parseDailyProgress(JSON.stringify({ ...course, session: planner.session(lesson, 'auto') }), programmingLessons).writable, true);
});

test('only learned scenes become available; future skills remain available for voluntary practice', () => {
  const words = future(), planner = programmingReview(words, at(22));
  const course = learnDailyLesson(createDailyProgress(), lesson, at(22));
  assert.deepEqual(planner.lessons(course, programmingLessons), []);
  assert.ok(planner.session(lesson, 'auto').queue.length);
  const due = programmingReview(words, at(23));
  assert.deepEqual(due.lessons(course, programmingLessons).map(item => item.id), [lesson.id]);
  assert.deepEqual(due.lessons(createDailyProgress(), programmingLessons), []);
  assert.equal(programmingReview({}, at(23)).session(lesson, 'auto').queue.length, 0);
  for (const id of lesson.wordIds) for (const ability of reviewAbilities) assert.equal(getSkill(words, id, ability).attempts ?? 0, 0);
});

test('programming rechecks target the failed ability and word instead of another choice question', () => {
  for (const current of programmingLessons) for (let index = 0; index < current.exercises.length - 1; index++) {
    const exercise = current.exercises[index];
    let session = beginDailyExercises(createDailySession(current, 'lesson', at(22)));
    // Exercise isolated failures without manufacturing answer history for earlier entries.
    session = { ...session, queue: session.queue.slice(index), focused: true, mode: 'review' };
    session = updateDailyDraft(session, { revealed: true });
    const updated = submitDailyAnswer({ ...createDailyProgress(), session }, current, { reveal: true }, at(22));
    for (const entry of updated.session.queue.filter(entry => entry.retry)) {
      const retry = current.rechecks.find(item => item.id === entry.exerciseId);
      assert.equal(retry.ability, exercise.ability);
      assert.ok(retry.wordIds.some(id => exercise.wordIds.includes(id)));
    }
  }
});
