// Run with Node 22.18+ / 24: node --test tools/test-review.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REVIEW_KEY,
  createReviewSession,
  applyReviewAnswer,
  advanceReviewSession,
  updateReviewProgress,
  getSkill,
  parseReviewProgress,
  serializeReviewProgress,
  spellingMode,
  summarizeAbility,
} from '../src/review.ts';

const at = (day, hour = 10) => new Date(2026, 8, day, hour).getTime();
const item = id => ({ id, word: `word${id}`, meaning: `含义${id}`, category: '测试', example: `word${id}`, exampleZh: '例句', phonetic: '', tier: '基础' });
const pool = Array.from({ length: 12 }, (_, index) => item(index + 1));
const question = (wordId = 1, ability = 'spelling', level = 0, retry = false) => ({ wordId, ability, level, retry });
const answer = (session, outcome) => advanceReviewSession(applyReviewAnswer(session, outcome));

test('default session contains five unique words and interleaves their two abilities', () => {
  const session = createReviewSession([...pool, pool[0]], {}, {}, at(14));
  assert.equal(session.items.length, 5);
  assert.equal(new Set(session.items.map(word => word.id)).size, 5);
  assert.equal(session.questions.length, 10);
  for (let index = 0; index < 5; index++) {
    assert.equal(session.questions[index].ability, 'meaning');
    assert.equal(session.questions[index + 5].ability, 'spelling');
    assert.equal(session.questions[index].wordId, session.questions[index + 5].wordId);
    assert.equal(session.questions[index].exposed, false);
    assert.equal(session.questions[index + 5].exposed, true);
  }
});

test('even repeated mistakes have at most one spaced retry per word and 15 total questions', () => {
  let session = createReviewSession(pool, {}, {}, at(14));
  const before = structuredClone(session);
  let iterations = 0;
  while (!session.finished && iterations++ < 30) session = answer(session, 'revealed');
  assert.equal(session.finished, true);
  assert.equal(session.questions.length, 15);
  assert.equal(before.questions.length, 10);
  assert.equal(before.answers.length, 0);
  const retries = session.questions.filter(candidate => candidate.retry);
  assert.equal(new Set(retries.map(candidate => candidate.wordId)).size, 5);
  for (let index = 0; index < session.questions.length; index++) {
    if (!session.questions[index].retry) continue;
    assert.notEqual(session.questions[index - 1].wordId, session.questions[index].wordId);
  }
});

test('single-word pools finish after two base questions without immediate fake retries', () => {
  let session = createReviewSession([pool[0]], {}, {}, at(14));
  session = answer(session, 'revealed');
  session = answer(session, 'assisted');
  assert.equal(session.finished, true);
  assert.equal(session.questions.length, 2);
  assert.equal(createReviewSession([], {}, {}, at(14)).finished, true);
});

test('an error on the final question is left for a later session when no spacing remains', () => {
  let session = createReviewSession(pool, {}, {}, at(14));
  while (session.index < 9) session = answer(session, 'independent');
  session = answer(session, 'revealed');
  assert.equal(session.finished, true);
  assert.equal(session.questions.length, 10);
});

test('two-word pools can schedule bounded retries with a different word in between', () => {
  let session = createReviewSession(pool.slice(0, 2), {}, {}, at(14));
  while (!session.finished) session = answer(session, 'assisted');
  assert.equal(session.questions.length, 6);
  assert.deepEqual(session.questions.map(candidate => candidate.wordId), [1, 2, 1, 2, 1, 2]);
});

test('submitting once does not advance, double submission and premature Next are ignored', () => {
  const session = createReviewSession(pool, {}, {}, at(14));
  assert.equal(advanceReviewSession(session), session);
  const submitted = applyReviewAnswer(session, 'independent');
  assert.equal(submitted.index, 0);
  assert.equal(submitted.answers.length, 1);
  assert.equal(applyReviewAnswer(submitted, 'revealed'), submitted);
  assert.equal(advanceReviewSession(submitted).index, 1);
});

test('meaning and spelling evidence stay separate without changing legacy records', () => {
  const legacy = Object.freeze({ 1: at(13) });
  const progress = updateReviewProgress({}, question(1, 'meaning'), 'independent', at(14));
  const next = updateReviewProgress(progress, question(), 'revealed', at(14));
  assert.equal(getSkill(next, 1, 'meaning').streak, 1);
  assert.equal(getSkill(next, 1, 'meaning').needsPractice, false);
  assert.equal(getSkill(next, 1, 'spelling').needsPractice, true);
  assert.equal(getSkill(progress, 1, 'spelling').needsPractice, false);
  const session = createReviewSession(pool, {}, legacy, at(14));
  assert.equal(session.items[0].id, 2);
  assert.equal(session.questions[0].level, 0);
  assert.deepEqual(legacy, { 1: at(13) });
  assert.equal(REVIEW_KEY, 'codewords-review-v1');
});

test('difficulty and spacing advance only on distinct due review days', () => {
  let progress = updateReviewProgress({}, question(), 'independent', at(14));
  assert.equal(getSkill(progress, 1, 'spelling').level, 0);
  assert.equal(getSkill(progress, 1, 'spelling').intervalDays, 1);
  progress = updateReviewProgress(progress, question(), 'independent', at(15));
  assert.equal(getSkill(progress, 1, 'spelling').level, 1);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').intervalDays, 1);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, at(16));
  progress = updateReviewProgress(progress, question(1, 'spelling', 1), 'independent', at(16));
  assert.equal(getSkill(progress, 1, 'spelling').level, 1);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 1);
  progress = updateReviewProgress(progress, question(1, 'spelling', 1), 'independent', at(17));
  assert.equal(getSkill(progress, 1, 'spelling').level, 2);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').intervalDays, 1);
});

test('same-day practice and early practice do not inflate level or postpone a due review', () => {
  let progress = updateReviewProgress({}, question(), 'independent', at(14));
  const initial = getSkill(progress, 1, 'spelling');
  for (let hour = 11; hour < 20; hour++) progress = updateReviewProgress(progress, question(), 'independent', at(14, hour));
  assert.equal(getSkill(progress, 1, 'spelling').streak, initial.streak);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, initial.dueAt);
  progress = updateReviewProgress(progress, question(), 'independent', at(15));
  const due = getSkill(progress, 1, 'spelling').dueAt;
  progress = updateReviewProgress(progress, question(1, 'spelling', 1), 'independent', at(15, 11));
  assert.equal(getSkill(progress, 1, 'spelling').level, 1);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, due);
  progress = updateReviewProgress(progress, question(1, 'meaning'), 'independent', at(14));
  progress = updateReviewProgress(progress, question(1, 'meaning'), 'independent', at(15));
  const meaningDue = getSkill(progress, 1, 'meaning').dueAt;
  progress = updateReviewProgress(progress, question(1, 'meaning'), 'independent', at(16));
  assert.equal(getSkill(progress, 1, 'meaning').streak, 2);
  assert.equal(getSkill(progress, 1, 'meaning').dueAt, meaningDue);
});

test('same-day corrected mistakes and retries keep weakness, even across midnight', () => {
  let progress = updateReviewProgress({}, question(), 'assisted', at(14));
  const due = getSkill(progress, 1, 'spelling').dueAt;
  progress = updateReviewProgress(progress, question(1, 'spelling', 0, true), 'independent', at(14, 11));
  progress = updateReviewProgress(progress, question(), 'independent', at(14, 12));
  assert.equal(getSkill(progress, 1, 'spelling').needsPractice, true);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, due);
  progress = updateReviewProgress(progress, question(1, 'spelling', 0, true), 'independent', at(15));
  assert.equal(getSkill(progress, 1, 'spelling').needsPractice, true);
  progress = updateReviewProgress(progress, question(), 'independent', at(16));
  assert.equal(getSkill(progress, 1, 'spelling').needsPractice, false);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 1);
});

test('repeated failures lower at most one level per day and bring mature words back sooner', () => {
  let progress = {};
  for (const day of [1, 2, 3, 4, 5, 6, 7, 8, 11, 18, 32]) {
    progress = updateReviewProgress(progress, question(1, 'spelling', getSkill(progress, 1, 'spelling').level), 'independent', at(day));
  }
  assert.equal(getSkill(progress, 1, 'spelling').level, 3);
  assert.equal(getSkill(progress, 1, 'spelling').intervalDays, 30);
  const originalDue = getSkill(progress, 1, 'spelling').dueAt;
  progress = updateReviewProgress(progress, question(1, 'spelling', 3), 'revealed', at(33));
  progress = updateReviewProgress(progress, question(1, 'spelling', 3, true), 'revealed', at(33, 11));
  assert.equal(getSkill(progress, 1, 'spelling').level, 2);
  assert.equal(getSkill(progress, 1, 'spelling').needsPractice, true);
  assert.ok(getSkill(progress, 1, 'spelling').dueAt < originalDue);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, at(34));
  progress = updateReviewProgress(progress, question(1, 'spelling', 2), 'independent', at(34));
  assert.equal(getSkill(progress, 1, 'spelling').level, 2);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 1);
  progress = updateReviewProgress(progress, question(1, 'spelling', 2), 'independent', at(34, 11));
  assert.equal(getSkill(progress, 1, 'spelling').level, 2);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 1);
});

test('an old easier spelling question cannot count as evidence for a harder format', () => {
  let progress = updateReviewProgress({}, question(), 'independent', at(14));
  progress = updateReviewProgress(progress, question(), 'independent', at(15));
  assert.equal(getSkill(progress, 1, 'spelling').level, 1);
  progress = updateReviewProgress(progress, question(), 'independent', at(16));
  assert.equal(getSkill(progress, 1, 'spelling').level, 1);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
});

test('a harder in-session challenge can record trouble without lowering the established spelling level', () => {
  let progress = {};
  for (const day of [10, 11, 12, 13]) {
    progress = updateReviewProgress(progress, question(1, 'spelling', getSkill(progress, 1, 'spelling').level), 'independent', at(day));
  }
  assert.equal(getSkill(progress, 1, 'spelling').level, 2);
  progress = updateReviewProgress(progress, question(1, 'spelling', 2), 'independent', at(14));
  const challenge = { ...question(1, 'spelling', 3), exposed: true };
  for (const outcome of ['assisted', 'revealed']) {
    let failed = updateReviewProgress(progress, challenge, outcome, at(14, 11));
    assert.equal(getSkill(failed, 1, 'spelling').level, 2);
    assert.equal(getSkill(failed, 1, 'spelling').needsPractice, true);
    assert.equal(getSkill(failed, 1, 'spelling').dueAt, at(15, 11));
    // The UI observes difficulty first and then records the final outcome.
    failed = updateReviewProgress(failed, challenge, 'revealed', at(14, 12));
    assert.equal(getSkill(failed, 1, 'spelling').level, 2);
    assert.equal(getSkill(failed, 1, 'spelling').dueAt, at(15, 11));
    assert.deepEqual(getSkill(failed, 1, 'meaning'), getSkill(progress, 1, 'meaning'));
  }
  const failedEstablishedFormat = updateReviewProgress(progress, { ...question(1, 'spelling', 2), exposed: true }, 'revealed', at(14, 11));
  assert.equal(getSkill(failedEstablishedFormat, 1, 'spelling').level, 1);
});

test('spelling gets the first question when needed and repeats when meaning is stable and not due', () => {
  let progress = {};
  for (const day of [10, 11, 14]) progress = updateReviewProgress(progress, question(1, 'meaning'), 'independent', at(day));
  progress = updateReviewProgress(progress, question(), 'assisted', at(14));
  const session = createReviewSession([pool[0]], progress, {}, at(15));
  assert.deepEqual(session.questions.map(candidate => candidate.ability), ['spelling', 'spelling']);
  assert.deepEqual(session.questions.map(candidate => candidate.exposed), [false, true]);
  progress = updateReviewProgress(progress, session.questions[0], 'independent', at(15));
  progress = updateReviewProgress(progress, session.questions[1], 'independent', at(15));
  assert.equal(getSkill(progress, 1, 'spelling').streak, 1);
  assert.equal(getSkill(progress, 1, 'meaning').lastPracticedAt, at(14));
});

test('a just-seen spelling answer creates a next-day baseline without becoming delayed recall evidence', () => {
  const session = createReviewSession([pool[0]], {}, {}, at(14));
  let progress = updateReviewProgress({}, session.questions[0], 'independent', at(14));
  progress = updateReviewProgress(progress, session.questions[1], 'independent', at(14));
  const spelling = getSkill(progress, 1, 'spelling');
  assert.equal(spelling.streak, 0);
  assert.equal(spelling.lastSuccessDay, '');
  assert.equal(spelling.dueAt, at(15));
  const tomorrow = createReviewSession([pool[0]], progress, {}, at(15));
  progress = updateReviewProgress(progress, tomorrow.questions[0], 'independent', at(15));
  progress = updateReviewProgress(progress, tomorrow.questions[1], 'independent', at(15));
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, at(15));
  assert.equal(createReviewSession([pool[0]], progress, {}, at(16)).questions[0].ability, 'spelling');
});

test('exposed success cannot clear an earlier mistake, advance a level, or delay the due date', () => {
  let progress = updateReviewProgress({}, question(), 'assisted', at(14));
  progress = updateReviewProgress(progress, { ...question(), exposed: true }, 'independent', at(15));
  assert.equal(getSkill(progress, 1, 'spelling').needsPractice, true);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, at(15));
  assert.equal(getSkill(progress, 1, 'spelling').lastSuccessDay, '');
});

test('the one retry follows the more serious failure, then the most recent failure when tied', () => {
  for (const [firstOutcome, secondOutcome, retryAbility] of [
    ['revealed', 'assisted', 'meaning'],
    ['assisted', 'revealed', 'spelling'],
    ['assisted', 'assisted', 'spelling'],
  ]) {
    let session = createReviewSession(pool.slice(0, 2), {}, {}, at(14));
    session = answer(session, firstOutcome);
    session = answer(session, 'independent');
    session = answer(session, secondOutcome);
    const retries = session.questions.filter(candidate => candidate.retry);
    assert.equal(retries.length, 1);
    assert.equal(retries[0].ability, retryAbility);
    assert.equal(retries[0].exposed, true);
  }
});

test('practiced overdue weak words no longer starve other overdue weak words', () => {
  let progress = {};
  for (let id = 1; id <= 10; id++) {
    const practicedDay = id <= 5 ? 11 : 12;
    progress = updateReviewProgress(progress, question(id, 'meaning'), 'assisted', at(practicedDay));
    progress = updateReviewProgress(progress, question(id), 'assisted', at(practicedDay));
  }
  const session = createReviewSession(pool.slice(0, 10), progress, {}, at(14));
  assert.deepEqual(session.items.map(word => word.id), [1, 2, 3, 4, 5]);
  for (const candidate of session.questions) progress = updateReviewProgress(progress, candidate, 'assisted', at(14));
  assert.equal(getSkill(progress, 1, 'meaning').dueAt, at(15));
  assert.deepEqual(createReviewSession(pool.slice(0, 10), progress, {}, at(14)).items.map(word => word.id), [6, 7, 8, 9, 10]);
});

test('assisted completion lowers difficulty once per day and resets the harder format evidence', () => {
  let progress = {};
  for (const day of [10, 11, 12, 13]) {
    progress = updateReviewProgress(progress, question(1, 'spelling', getSkill(progress, 1, 'spelling').level), 'independent', at(day));
  }
  assert.equal(getSkill(progress, 1, 'spelling').level, 2);
  progress = updateReviewProgress(progress, question(1, 'spelling', 2), 'assisted', at(14));
  progress = updateReviewProgress(progress, { ...question(1, 'spelling', 2), exposed: true }, 'assisted', at(14, 11));
  assert.equal(getSkill(progress, 1, 'spelling').level, 1);
  assert.equal(getSkill(progress, 1, 'spelling').streak, 0);
  assert.equal(getSkill(progress, 1, 'spelling').dueAt, at(15));
});

test('weak due words take priority while one truly untested word keeps a place', () => {
  let progress = {};
  for (let id = 1; id <= 8; id++) {
    progress = updateReviewProgress(progress, question(id, 'meaning'), 'assisted', at(12));
    progress = updateReviewProgress(progress, question(id), 'assisted', at(12));
  }
  const session = createReviewSession(pool, progress, {}, at(14));
  assert.deepEqual(session.items.map(word => word.id), [1, 2, 3, 4, 9]);
  const next = updateReviewProgress(progress, question(9), 'independent', at(14));
  assert.equal(createReviewSession(pool, next, {}, at(14)).items.at(-1).id, 10);
});

test('valid data round-trips and absent data starts fresh without touching old keys', () => {
  const progress = updateReviewProgress({}, question(), 'independent', at(14));
  assert.deepEqual(parseReviewProgress(null), {});
  assert.deepEqual(parseReviewProgress(serializeReviewProgress(progress)), progress);
  const parsed = parseReviewProgress(serializeReviewProgress(progress));
  parsed['1'].spelling.streak = 100;
  assert.equal(progress['1'].spelling.streak, 1);
});

test('corrupt, unsupported, and dangerous storage cannot silently become empty progress', () => {
  for (const raw of ['', '{', '{}', 'null', '[]', '{"version":2,"words":{}}', '{"version":1,"words":{"__proto__":{}}}']) {
    assert.throws(() => parseReviewProgress(raw));
  }
  const valid = JSON.parse(serializeReviewProgress(updateReviewProgress({}, question(), 'independent', at(14))));
  for (const [field, value] of [['level', 9], ['streak', -1], ['dueAt', 'tomorrow'], ['intervalDays', 999], ['lastFailureDay', '2026-02-31'], ['needsPractice', 'false']]) {
    const invalid = structuredClone(valid);
    invalid.words['1'].spelling[field] = value;
    assert.throws(() => parseReviewProgress(JSON.stringify(invalid)), field);
  }
});

test('result descriptions separate scaffolding, full spelling, and same-session correction', () => {
  assert.deepEqual([0, 1, 2, 3].map(spellingMode), ['gap', 'tiles', 'gaps', 'type']);
  const session = createReviewSession(pool, {}, {}, at(14));
  session.answers = [{ question: question(), outcome: 'independent' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /按题目提示/);
  session.answers = [{ question: question(1, 'spelling', 3), outcome: 'independent' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /完整拼写能独立完成/);
  session.answers = [{ question: question(), outcome: 'assisted' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /借助提示完成/);
  session.answers = [{ question: question(), outcome: 'revealed' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /已看答案/);
  session.answers = [{ question: question(), outcome: 'assisted' }, { question: question(1, 'spelling', 0, true), outcome: 'independent' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /本轮已纠正，下次继续确认/);
  session.answers = [{ question: question(), outcome: 'assisted' }, { question: { ...question(), exposed: true }, outcome: 'independent' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /本轮已纠正，下次继续确认/);
  assert.match(summarizeAbility(session, 1, 'meaning'), /本轮侧重拼写，词义留待后续复习/);
  session.answers = [{ question: { ...question(1, 'spelling', 3), exposed: true }, outcome: 'independent' }];
  assert.match(summarizeAbility(session, 1, 'spelling'), /本轮看过该词后完成拼写，下次再确认/);
  assert.match(summarizeAbility(session, 2, 'meaning'), /尚未练习/);
});
