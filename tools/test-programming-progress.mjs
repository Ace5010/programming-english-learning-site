import test from 'node:test';
import assert from 'node:assert/strict';
import { initializeProgrammingReview, mergeProgrammingCourse, persistProgrammingCourseEvidence, persistProgrammingReviewSnapshot, PROGRAMMING_COURSE_KEY } from '../src/programmingProgress.ts';
import { createDailyProgress, createDailySession, learnDailyLesson, beginDailyExercises, updateDailyDraft, submitDailyAnswer, advanceDailySession, markDailyHelp } from '../src/dailyProgress.ts';
import { programmingLessons } from '../src/programmingCourse.ts';
import { getSkill, parseReviewProgress, serializeReviewProgress, updateReviewProgress, REVIEW_KEY, reviewAbilities, isWordDue } from '../src/review.ts';

const at = day => new Date(2026, 8, day, 10).getTime();
const lesson = programmingLessons[0];
const storage = (seed = {}) => { const data = new Map(Object.entries(seed)); return { data, getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) }; };
function taught() {
  let course = { ...createDailyProgress(), session: createDailySession(lesson, 'lesson', at(22)) };
  course = learnDailyLesson(course, lesson, at(22));
  return { ...course, session: beginDailyExercises(course.session) };
}

test('self-confirmed old words keep review eligibility and original markers, without completing courses or inventing answers', () => {
  const saved = storage({ 'codewords-mastered': '[1,21]', 'codewords-favorites': '[4]' });
  const progress = initializeProgrammingReview(saved, at(22));
  assert.deepEqual(Object.keys(progress), ['1', '21']);
  assert.equal(saved.getItem('codewords-mastered'), '[1,21]');
  assert.equal(saved.getItem('codewords-favorites'), '[4]');
  assert.equal(saved.getItem(PROGRAMMING_COURSE_KEY), null);
  assert.equal(progress[1].source, 'legacy');
  assert.equal(progress[1].firstLearnedAt, 0);
  assert.ok(isWordDue(progress, 1, at(22)));
  for (const ability of reviewAbilities) assert.equal(getSkill(progress, 1, ability).attempts ?? 0, 0);
  const raw = saved.getItem(REVIEW_KEY);
  initializeProgrammingReview(saved, at(23));
  assert.equal(saved.getItem(REVIEW_KEY), raw);
});

test('teaching enrolls new words for tomorrow even if the lesson is left unfinished, without claiming skill', () => {
  const course = taught();
  const progress = mergeProgrammingCourse({}, course, programmingLessons, at(22));
  for (const id of lesson.wordIds) {
    assert.equal(progress[id].source, 'course');
    assert.equal(progress[id].firstLearnedAt, at(22));
    assert.equal(isWordDue(progress, id, at(22)), false);
    assert.equal(isWordDue(progress, id, at(23)), true);
    for (const ability of reviewAbilities) assert.equal(getSkill(progress, id, ability).attempts ?? 0, 0);
  }
  assert.equal(course.lessons[lesson.id]?.completedAt ?? 0, 0);
});

test('course evidence is replay-safe across typing, next, reload and repeated initialization', () => {
  let course = taught();
  const task = lesson.exercises[0];
  course.session = updateDailyDraft(course.session, { choice: task.answers[0] });
  course = submitDailyAnswer(course, lesson, {}, at(22));
  let progress = mergeProgrammingCourse({}, course, programmingLessons, at(22));
  const id = task.wordIds[0];
  assert.equal(getSkill(progress, id, task.ability).attempts, 1);
  assert.equal(getSkill(progress, id, task.ability).streak, 0);
  const once = JSON.stringify(progress);
  progress = mergeProgrammingCourse(progress, JSON.parse(JSON.stringify(course)), programmingLessons, at(23));
  assert.equal(JSON.stringify(progress), once);
  course = advanceDailySession(course, lesson, at(22));
  progress = mergeProgrammingCourse(progress, course, programmingLessons, at(22));
  assert.equal(JSON.stringify(progress), once);
});

test('a hint survives leaving before submit and does not count an extra answer', () => {
  let course = taught();
  course = markDailyHelp(course, lesson, false, at(23));
  let progress = mergeProgrammingCourse({}, course, programmingLessons, at(23));
  const task = lesson.exercises[0], id = task.wordIds[0];
  assert.equal(getSkill(progress, id, task.ability).needsPractice, true);
  assert.equal(getSkill(progress, id, task.ability).attempts ?? 0, 0);
  assert.equal(getSkill(progress, id, task.ability).dueAt, at(24));
  course.session = updateDailyDraft(course.session, { choice: task.answers[0] });
  course = submitDailyAnswer(course, lesson, {}, at(23));
  progress = mergeProgrammingCourse(progress, course, programmingLessons, at(23));
  assert.equal(getSkill(progress, id, task.ability).attempts, 1);
  assert.equal(getSkill(progress, id, task.ability).hintedAnswers, 1);
  assert.equal(getSkill(progress, id, task.ability).needsPractice, true);
});

test('recovering an unsynchronized hint days later preserves the saved event day and deadline', () => {
  const course = markDailyHelp(taught(), lesson, false, at(22));
  const task = lesson.exercises[0], id = task.wordIds[0];
  const progress = mergeProgrammingCourse({}, course, programmingLessons, at(24));
  const skill = getSkill(progress, id, task.ability);
  assert.equal(skill.lastFailureDay, '2026-09-22');
  assert.equal(skill.lastPracticedAt, at(22));
  assert.equal(skill.dueAt, at(23));
  assert.equal(skill.attempts ?? 0, 0);
  assert.deepEqual(mergeProgrammingCourse(progress, course, programmingLessons, at(25)), progress);
});

test('a retry hint recovers the timestamp stored against its original exercise', () => {
  let course = taught();
  const original = lesson.exercises[3];
  for (const task of lesson.exercises) {
    if (task.id === original.id) course = markDailyHelp(course, lesson, false, at(22));
    course.session = updateDailyDraft(course.session, { choice: task.answers[0] });
    course = submitDailyAnswer(course, lesson, {}, at(22));
    course = advanceDailySession(course, lesson, at(22));
  }
  const entry = course.session.queue[course.session.index];
  assert.equal(entry.retryOf, original.id);
  const retry = lesson.rechecks.find(item => item.id === entry.exerciseId);
  course = markDailyHelp(course, lesson, false, at(23));
  assert.equal(course.lessons[lesson.id].errors[entry.retryOf].lastAt, at(23));
  assert.equal(course.lessons[lesson.id].errors[retry.id], undefined);
  const progress = mergeProgrammingCourse({}, course, programmingLessons, at(25));
  for (const id of retry.wordIds) {
    const skill = getSkill(progress, id, retry.ability);
    assert.equal(skill.lastFailureDay, '2026-09-23');
    assert.equal(skill.dueAt, at(24));
  }
});

test('meaning, context and listening observations do not create spelling evidence', () => {
  let course = taught(), progress = {};
  for (let index = 0; index < 3; index++) {
    const task = lesson.exercises[index];
    course.session = updateDailyDraft(course.session, { choice: task.answers[0] });
    course = submitDailyAnswer(course, lesson, {}, at(22));
    progress = mergeProgrammingCourse(progress, course, programmingLessons, at(22));
    for (const id of task.wordIds) assert.ok(getSkill(progress, id, task.ability).attempts > 0);
    course = advanceDailySession(course, lesson, at(22));
  }
  for (const id of lesson.wordIds) assert.equal(getSkill(progress, id, 'spelling').attempts ?? 0, 0);
  assert.deepEqual(parseReviewProgress(JSON.stringify({ version: 1, words: progress })), progress);
});

test('broken records and save failure never erase existing progress', () => {
  const broken = storage({ [REVIEW_KEY]: '{bad', 'codewords-mastered': '[1]' });
  assert.throws(() => initializeProgrammingReview(broken));
  assert.throws(() => persistProgrammingCourseEvidence(broken, taught(), programmingLessons));
  assert.equal(broken.getItem(REVIEW_KEY), '{bad');
  const saved = storage({ 'codewords-mastered': '[1]' });
  initializeProgrammingReview(saved, at(22));
  const before = saved.getItem(REVIEW_KEY);
  saved.setItem = () => { throw new Error('quota'); };
  assert.throws(() => persistProgrammingCourseEvidence(saved, taught(), programmingLessons), /quota/);
  assert.equal(saved.getItem(REVIEW_KEY), before);
});

test('word-review persistence rejects a changed review snapshot before either write', () => {
  const saved = storage({ 'codewords-mastered': '[1]', 'codewords-quiz-last-tested': '{}' });
  const progress = initializeProgrammingReview(saved, at(22));
  const expectedRaw = saved.getItem(REVIEW_KEY);
  const answer = updateReviewProgress(progress, { wordId: 1, ability: 'meaning', level: 0, retry: false }, 'independent', at(23));
  const newer = serializeReviewProgress(mergeProgrammingCourse(progress, taught(), programmingLessons, at(22)));
  saved.data.set(REVIEW_KEY, newer);
  assert.throws(() => persistProgrammingReviewSnapshot(saved, answer, expectedRaw, { raw: '{}', history: { 1: at(23) } }), /另一页面更新了复习记录/);
  assert.equal(saved.getItem(REVIEW_KEY), newer);
  assert.equal(saved.getItem('codewords-quiz-last-tested'), '{}');
});

test('word-review persistence rejects changed history before touching the primary review record', () => {
  const saved = storage({ 'codewords-mastered': '[1]', 'codewords-quiz-last-tested': '{}' });
  const progress = initializeProgrammingReview(saved, at(22));
  const raw = saved.getItem(REVIEW_KEY);
  const newerHistory = JSON.stringify({ 21: at(23) });
  saved.data.set('codewords-quiz-last-tested', newerHistory);
  assert.throws(() => persistProgrammingReviewSnapshot(saved, progress, raw, { raw: '{}', history: { 1: at(23) } }), /另一页面更新了复习历史/);
  assert.equal(saved.getItem(REVIEW_KEY), raw);
  assert.equal(saved.getItem('codewords-quiz-last-tested'), newerHistory);
});

test('a history race after the primary save is reported without overwriting newer history', () => {
  const saved = storage({ 'codewords-mastered': '[1]', 'codewords-quiz-last-tested': '{}' });
  const progress = initializeProgrammingReview(saved, at(22));
  const expectedRaw = saved.getItem(REVIEW_KEY);
  const answer = updateReviewProgress(progress, { wordId: 1, ability: 'meaning', level: 0, retry: false }, 'independent', at(23));
  const newerHistory = JSON.stringify({ 21: at(23) });
  const write = saved.setItem;
  saved.setItem = (key, raw) => { write(key, raw); if (key === REVIEW_KEY) saved.data.set('codewords-quiz-last-tested', newerHistory); };
  assert.throws(() => persistProgrammingReviewSnapshot(saved, answer, expectedRaw, { raw: '{}', history: { 1: at(23) } }), /复习结果已保存.*保留较新的历史/);
  assert.deepEqual(parseReviewProgress(saved.getItem(REVIEW_KEY)), answer);
  assert.equal(saved.getItem('codewords-quiz-last-tested'), newerHistory);
});

test('normal word-review saves both records while hint-only saves leave legacy history unchanged', () => {
  const saved = storage({ 'codewords-mastered': '[1]', 'codewords-quiz-last-tested': '{}' });
  const progress = initializeProgrammingReview(saved, at(22));
  const question = { wordId: 1, ability: 'meaning', level: 0, retry: false };
  const hint = updateReviewProgress(progress, question, 'assisted', at(23), false);
  persistProgrammingReviewSnapshot(saved, hint, saved.getItem(REVIEW_KEY));
  assert.equal(saved.getItem('codewords-quiz-last-tested'), '{}');
  assert.equal(getSkill(parseReviewProgress(saved.getItem(REVIEW_KEY)), 1, 'meaning').attempts ?? 0, 0);
  const answer = updateReviewProgress(hint, question, 'assisted', at(23));
  persistProgrammingReviewSnapshot(saved, answer, saved.getItem(REVIEW_KEY), { raw: '{}', history: { 1: at(23) } });
  assert.equal(getSkill(parseReviewProgress(saved.getItem(REVIEW_KEY)), 1, 'meaning').attempts, 1);
  assert.deepEqual(JSON.parse(saved.getItem('codewords-quiz-last-tested')), { 1: at(23) });
});
