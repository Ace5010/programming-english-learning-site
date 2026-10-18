import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createDailyProgress, createDailySession, beginDailyExercises, learnDailyLesson,
  nextDailyLesson, dailyLessonLearned, dailyExerciseKnowledgeIds, createDailyReviewSession,
  updateDailyDraft, submitDailyAnswer, advanceDailySession, dueDailyLessons,
  parseDailyProgress, persistDailyProgress, dailyReviewErrors,
} from '../src/dailyProgress.ts';

const at = day => new Date(2026, 8, day, 10).getTime();
const lesson = {
  id: 'course-1',
  phrases: [{ id: 'repository', en: 'repository', zh: '代码仓库' }, { id: 'project', en: 'project', zh: '项目' }],
  exercises: [
    { id: 'meaning', kind: 'choice', prompt: '理解', options: ['代码仓库', '项目'], answers: ['代码仓库'], explanation: '解释' },
    { id: 'spell', kind: 'write', audioId: 'repository', prompt: '拼写', answers: ['repository'], explanation: '解释' },
    { id: 'project', kind: 'listen', audioId: 'project', prompt: '听力', options: ['project', 'repository'], answers: ['project'], explanation: '解释' },
  ],
  rechecks: [],
};
const begin = (progress = createDailyProgress()) => ({ ...progress, session: beginDailyExercises(createDailySession(lesson, 'lesson', at(1))) });
const answer = (progress, change, now = at(1)) => submitDailyAnswer({ ...progress, session: updateDailyDraft(progress.session, change) }, lesson, {}, now);

test('teaching confirmation enrolls knowledge without inventing any tested ability', () => {
  const untouched = { ...createDailyProgress(), session: createDailySession(lesson, 'lesson', at(1)) };
  assert.equal(dailyLessonLearned(untouched, lesson), false);
  assert.deepEqual(dueDailyLessons(untouched, [lesson], at(10)), []);
  const learned = learnDailyLesson(untouched, lesson, at(1));
  assert.equal(dailyLessonLearned(learned, lesson), true);
  assert.deepEqual(Object.keys(learned.knowledge).sort(), ['project', 'repository']);
  for (const item of Object.values(learned.knowledge)) {
    assert.equal(item.firstLearnedAt, at(1));
    assert.deepEqual(item.lessonIds, [lesson.id]);
    for (const skill of Object.values(item.skills)) {
      assert.equal(skill.attempts, 0);
      assert.equal(skill.independentAnswers, 0);
      assert.equal(skill.dueAt, 0);
    }
  }
  assert.deepEqual(dueDailyLessons(learned, [lesson], at(1)), []);
  assert.deepEqual(dueDailyLessons(learned, [lesson], at(2)).map(item => item.id), [lesson.id]);
  assert.equal(parseDailyProgress(JSON.stringify(learned), [lesson]).writable, true);
  assert.equal(learnDailyLesson(learned, lesson, at(3)).knowledge.repository.firstLearnedAt, at(1));
});

test('knowledge mapping records the actual expression and tested ability independently', () => {
  let progress = begin(learnDailyLesson(createDailyProgress(), lesson, at(1)));
  assert.deepEqual(dailyExerciseKnowledgeIds(lesson, lesson.exercises[0]), ['repository']);
  progress = answer(progress, { choice: '代码仓库' });
  assert.equal(progress.knowledge.repository.skills.meaning.independentAnswers, 1);
  assert.equal(progress.knowledge.repository.skills.writing.attempts, 0);
  assert.equal(progress.knowledge.project.skills.meaning.attempts, 0);
  progress = advanceDailySession(progress, lesson, at(1));
  progress = answer(progress, { text: 'repositry' });
  assert.equal(progress.knowledge.repository.skills.writing.needsPractice, true);
  assert.equal(progress.knowledge.repository.skills.meaning.needsPractice, false);
  assert.equal(progress.knowledge.project.skills.listening.attempts, 0);
  assert.deepEqual(dailyExerciseKnowledgeIds(lesson, { ...lesson.exercises[0], knowledgeIds: ['specific-context'] }), ['specific-context']);
});

test('focused reviews select weak or due knowledge instead of repeating the full lesson', () => {
  let progress = begin(learnDailyLesson(createDailyProgress(), lesson, at(1)));
  progress = answer(progress, { choice: '代码仓库' });
  progress = advanceDailySession(progress, lesson, at(1));
  progress = answer(progress, { text: 'wrong' });
  progress.knowledge.repository.skills.meaning.dueAt = at(10);
  const review = createDailyReviewSession(progress, lesson, 'auto', at(2));
  assert.deepEqual(review.queue.map(item => item.exerciseId), ['spell']);
  const saved = { ...progress, session: review };
  assert.equal(parseDailyProgress(JSON.stringify(saved), [lesson]).writable, true);
  const listening = createDailyReviewSession(progress, lesson, 'listening', at(2));
  assert.deepEqual(listening.queue.map(item => item.exerciseId), ['project']);
  assert.equal(listening.mode, 'review');
});

test('delayed knowledge recall advances only its own ability, not same-day repetition', () => {
  let progress = begin(learnDailyLesson(createDailyProgress(), lesson, at(1)));
  progress = answer(progress, { choice: '代码仓库' });
  progress.session = createDailyReviewSession(progress, lesson, 'meaning', at(1));
  progress = answer(progress, { choice: '代码仓库' });
  assert.equal(progress.knowledge.repository.skills.meaning.successDays, 0);
  progress.session = createDailyReviewSession(progress, lesson, 'meaning', at(2));
  progress = answer(progress, { choice: '代码仓库' }, at(2));
  assert.equal(progress.knowledge.repository.skills.meaning.successDays, 1);
  assert.equal(progress.knowledge.repository.skills.writing.successDays, 0);
  assert.equal(progress.knowledge.repository.skills.writing.attempts, 0);
});

test('the earliest incomplete lesson controls unlock even with historical skipped completions', () => {
  const second = { ...lesson, id: 'course-2' };
  const third = { ...lesson, id: 'course-3' };
  const progress = createDailyProgress();
  progress.lessons[third.id] = { completedAt: at(1) };
  assert.equal(nextDailyLesson(progress, [lesson, second, third]), lesson);
  progress.lessons[lesson.id] = { completedAt: at(2) };
  assert.equal(nextDailyLesson(progress, [lesson, second, third]), second);
  progress.lessons[second.id] = { completedAt: at(3) };
  assert.equal(nextDailyLesson(progress, [lesson, second, third]), undefined);
});

test('custom course keys preserve daily data and retain the same conflict protections', () => {
  const key = 'codewords-programming-course-v1';
  const data = new Map([['codewords-daily-v1', 'daily-sentinel']]);
  const storage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
  const progress = learnDailyLesson(createDailyProgress(), lesson, at(1));
  progress.favorites = ['repository'];
  const first = persistDailyProgress(storage, progress, null, key);
  assert.equal(first.saved, true);
  assert.equal(data.get('codewords-daily-v1'), 'daily-sentinel');
  assert.equal(parseDailyProgress(data.get(key), [lesson]).writable, true);
  assert.equal(persistDailyProgress(storage, progress, null, key).saved, false);
  data.set(key, '{broken');
  assert.equal(persistDailyProgress(storage, progress, '{broken', key).saved, false);
  assert.equal(data.get(key), '{broken');
});

test('invalid knowledge or favorites extensions preserve raw records without sanitizing', () => {
  const progress = learnDailyLesson(createDailyProgress(), lesson, at(1));
  const invalids = [];
  const invalidCount = structuredClone(progress); invalidCount.knowledge.repository.skills.meaning.attempts = 5; invalids.push(invalidCount);
  const invalidDate = structuredClone(progress); invalidDate.knowledge.repository.firstLearnedAt = -1; invalids.push(invalidDate);
  const invalidFavorites = structuredClone(progress); invalidFavorites.favorites = ['repository', 'repository']; invalids.push(invalidFavorites);
  const invalidFocused = begin(progress); invalidFocused.session.focused = true; invalids.push(invalidFocused);
  for (const invalid of invalids) {
    const raw = JSON.stringify(invalid);
    const parsed = parseDailyProgress(raw, [lesson]);
    assert.equal(parsed.writable, false);
    assert.equal(parsed.raw, raw);
  }
  assert.equal(parseDailyProgress(JSON.stringify(createDailyProgress()), [lesson]).writable, true);
});

test('review filters exclude still-learning errors and unrelated ability due dates', () => {
  let progress = begin(learnDailyLesson(createDailyProgress(), lesson, at(1)));
  progress = answer(progress, { choice: '项目' });
  progress.learning = { version: 1, turns: 1, rounds: 0, targets: {
    repository: { introducedAt: at(1), confidence: 0.1, abilities: {}, lastSeenTurn: 1, lastFailureTurn: 1, signatures: [], transfer: false, readyAt: 0 },
  } };
  assert.deepEqual(dailyReviewErrors(progress, lesson), []);
  progress.learning.targets.repository.readyAt = at(2);
  progress.knowledge.repository.skills.meaning.dueAt = at(3);
  progress.knowledge.repository.skills.writing.dueAt = at(8);
  assert.deepEqual(dailyReviewErrors(progress, lesson, 'writing'), []);
  assert.deepEqual(dueDailyLessons(progress, [lesson], at(4), 'writing'), []);
  assert.deepEqual(dueDailyLessons(progress, [lesson], at(4), 'meaning'), [lesson]);
});
