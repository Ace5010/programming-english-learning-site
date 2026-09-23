import test from 'node:test';
import assert from 'node:assert/strict';
import { dailyUnits, dailyLessons, dailyPhrases } from '../src/dailyCourse.ts';
import { adaptiveDailyUnits, adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { createDailyDraft, checkDailyAnswer, dailyExerciseAbility, findDailyExercise } from '../src/dailyProgress.ts';
import { writtenAnswersMatch } from '../src/writtenAnswer.ts';

const phrases = new Map(dailyPhrases.map(phrase => [phrase.id, phrase]));
const originals = new Map(dailyLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks]).map(task => [task.id, task]));
const plain = task => {
  const { knowledgeIds, learningDifficulty, learningSignature, ...original } = task;
  return original;
};
const generated = lesson => lesson.practice.filter(task => !originals.has(task.id));
const normalize = value => value.normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
const equivalentGroups = [
  ['hello', 'hi'], ['goodbye', 'bye'], ['i-am-ben', 'im-ben', 'my-name-is-ben'], ['i-am-mia', 'im-mia', 'my-name-is-mia'],
];
const equivalent = (left, right) => normalize(left.zh) === normalize(right.zh)
  || writtenAnswersMatch(left.en, right.en) || writtenAnswersMatch(right.en, left.en)
  || equivalentGroups.some(group => group.includes(left.id) && group.includes(right.id));

function correctDraft(task) {
  const draft = createDailyDraft(task);
  if (task.kind === 'choice' || task.kind === 'listen') draft.choice = task.answers[0];
  else if (task.kind === 'fill') draft.blanks = task.blanks.map(answers => answers[0]);
  else if (task.kind === 'write') draft.text = task.answers[0];
  else if (task.kind === 'speak') { draft.text = task.sample; draft.checks = task.checks.map(() => true); }
  else {
    const remaining = new Set(task.options.map((_, index) => index));
    let rest = task.answers[0];
    while (rest) {
      const index = [...remaining].find(index => rest === task.options[index] || rest.startsWith(`${task.options[index]} `));
      assert.notEqual(index, undefined, `${task.id}: ${rest}`);
      draft.order.push(index); remaining.delete(index); rest = rest.slice(task.options[index].length).trimStart();
    }
  }
  return draft;
}

test('the adaptive pool preserves all 24 lessons, original exercises, English and recording IDs', () => {
  assert.equal(adaptiveDailyUnits.length, 4);
  assert.equal(adaptiveDailyLessons.length, 24);
  assert.deepEqual(adaptiveDailyUnits.map(unit => unit.lessons.length), [6, 6, 6, 6]);
  assert.deepEqual(adaptiveDailyUnits.map(({ lessons, ...unit }) => unit), dailyUnits.map(({ lessons, ...unit }) => unit));
  for (const [index, lesson] of adaptiveDailyLessons.entries()) {
    const original = dailyLessons[index];
    assert.equal(lesson.id, original.id);
    assert.deepEqual(lesson.phrases, original.phrases);
    assert.deepEqual(lesson.exercises.map(plain), original.exercises);
    assert.deepEqual(lesson.rechecks.map(plain), original.rechecks);
    assert.equal(lesson.learningGoal, 'communication');
    assert.deepEqual(lesson.learningTargets, original.phrases.map(phrase => phrase.id));
    assert.ok(lesson.practice.length > lesson.exercises.length + lesson.rechecks.length);
  }
  for (const original of originals.values()) {
    assert.equal('knowledgeIds' in original, false, 'Original curriculum was not mutated');
    assert.equal('learningDifficulty' in original, false);
  }
});

test('every candidate has precise taught targets, a stable unique ID and a short signature', () => {
  const taught = new Set(), ids = new Set();
  for (const lesson of adaptiveDailyLessons) {
    lesson.learningTargets.forEach(id => taught.add(id));
    assert.equal(new Set(lesson.practice.map(task => task.id)).size, lesson.practice.length);
    for (const task of lesson.practice) {
      assert.ok(!ids.has(task.id), task.id); ids.add(task.id);
      if (task.kind !== 'speak') assert.equal(task.knowledgeIds.length, 1, `Do not blame an entire lesson: ${task.id}`);
      assert.ok(task.knowledgeIds.length > 0);
      assert.equal(new Set(task.knowledgeIds).size, task.knowledgeIds.length);
      for (const id of task.knowledgeIds) { assert.ok(taught.has(id), task.id); assert.ok(phrases.has(id), task.id); }
      assert.ok(task.learningSignature.length > 0 && task.learningSignature.length <= 180, task.id);
      assert.ok(['recognition', 'context', 'recall'].includes(task.learningDifficulty), task.id);
      assert.equal(findDailyExercise(lesson, task.id), task);
      if (task.audioId) assert.ok(phrases.has(task.audioId), task.id);
    }
  }
});

test('original audio and answer targets remain exact, including earlier knowledge in integrated lessons', () => {
  for (const lesson of adaptiveDailyLessons) for (const task of [...lesson.exercises, ...lesson.rechecks]) {
    if (task.kind === 'speak' && task.readAloud?.length) assert.deepEqual(task.knowledgeIds, [...new Set(task.readAloud.map(phrase => phrase.id))], task.id);
    else if (task.audioId) assert.deepEqual(task.knowledgeIds, [task.audioId], task.id);
  }
  const target = id => adaptiveDailyLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks]).find(task => task.id === id).knowledgeIds;
  assert.deepEqual(target('A1-01-01-e01'), ['hello']);
  assert.deepEqual(target('A1-01-02-e02'), ['i-am-ben']);
  assert.deepEqual(target('A1-02-01-e01'), ['from-china']);
  assert.deepEqual(target('A1-02-04-r01'), ['from-japan']);
  assert.deepEqual(target('A1-03-06-e02'), ['they-are-teachers']);
  assert.deepEqual(target('A1-04-02-e01'), ['it-is-an-apple']);
  assert.deepEqual(target('A1-04-06-e02'), ['he-is-a-teacher']);
  assert.deepEqual(target('A1-01-01-e05'), ['hello', 'goodbye']);
  assert.deepEqual(target('A1-04-06-e05'), ['origin-ben', 'this-is-a-book', 'those-are-pens']);
});

test('all 706 available items are answerable by the existing checker and reject empty answers', () => {
  let checked = 0;
  for (const lesson of adaptiveDailyLessons) for (const task of lesson.practice) {
    assert.equal(checkDailyAnswer(task, correctDraft(task)).correct, true, task.id);
    assert.equal(checkDailyAnswer(task, createDailyDraft(task)).correct, false, task.id);
    if (['choice', 'listen'].includes(task.kind)) {
      assert.equal(task.options.filter(choice => checkDailyAnswer(task, { ...createDailyDraft(task), choice }).correct).length, 1, task.id);
    }
    if (task.kind === 'fill') assert.equal(checkDailyAnswer(task, correctDraft(task)).expected[0], phrases.get(task.audioId).en, task.id);
    checked++;
  }
  assert.ok(checked > originals.size, 'Variants add an available pool, without changing the fixed original content');
});

test('generated distractors use current or earlier recordings and exclude equivalent valid answers', () => {
  const taught = new Map();
  for (const lesson of adaptiveDailyLessons) {
    lesson.phrases.forEach(phrase => taught.set(phrase.id, phrase));
    for (const task of generated(lesson)) {
      if (!['choice', 'listen'].includes(task.kind)) continue;
      const meaning = task.id.endsWith('-meaning');
      const options = task.options.map(option => {
        const phrase = [...taught.values()].find(phrase => (meaning ? phrase.zh : phrase.en) === option);
        assert.ok(phrase, `Untaught or newly invented option in ${task.id}: ${option}`);
        return phrase;
      });
      assert.ok(options.length >= 2 && options.length <= 3, task.id);
      for (let index = 0; index < options.length; index++) for (const other of options.slice(index + 1)) {
        assert.equal(equivalent(options[index], other), false, `${task.id}: ${options[index].en} / ${other.en}`);
      }
    }
  }
});

test('every expression supports scaffolded recognition, listening and later writing without a fixed quota', () => {
  for (const lesson of adaptiveDailyLessons) for (const id of lesson.learningTargets) {
    const choices = generated(lesson).filter(task => task.knowledgeIds.includes(id));
    assert.ok(choices.some(task => task.learningDifficulty === 'recognition' && task.kind === 'choice'), id);
    assert.ok(choices.some(task => task.kind === 'listen' && task.audioId === id), id);
    assert.ok(choices.some(task => task.learningDifficulty === 'recall' && task.kind === 'write'), id);
    assert.deepEqual(new Set(choices.map(dailyExerciseAbility)), new Set(['meaning', 'listening', 'writing']), id);
    assert.equal(new Set(choices.map(task => task.learningSignature)).size, choices.length, id);
  }
  const first = generated(adaptiveDailyLessons[0]);
  assert.ok(first.some(task => task.knowledgeIds[0] === 'goodbye' && task.kind === 'fill' && task.blanks[0][0] === 'bye'));
  assert.ok(first.filter(task => task.kind === 'write').every(task => task.learningDifficulty === 'recall'));
});

test('generated English and audio are existing phrases, and lengthy introductions use manageable blocks', () => {
  const existingEnglish = new Set(dailyPhrases.map(phrase => phrase.en));
  for (const lesson of adaptiveDailyLessons) for (const task of generated(lesson)) {
    const phrase = phrases.get(task.knowledgeIds[0]);
    if (task.audioId) assert.equal(task.audioId, phrase.id);
    if (['listen', 'order', 'write'].includes(task.kind) || task.id.endsWith('-expression')) {
      for (const answer of task.answers) assert.ok(existingEnglish.has(answer), `${task.id}: ${answer}`);
    }
    if (task.kind === 'order') {
      assert.ok(task.options.length >= 2 && task.options.length <= 8, task.id);
      assert.equal(correctDraft(task).order.map(index => task.options[index]).join(' '), phrase.en);
      assert.notEqual(task.options.join(' '), phrase.en, 'An ordering task should not start solved');
    }
  }
  const long = generated(adaptiveDailyLessons.find(lesson => lesson.id === 'A1-03-06')).find(task => task.id.endsWith('-ben-introduction-order'));
  assert.equal(long.options.length, 3);
  assert.ok(long.options.every(option => /[.!?]$/.test(option)));
});

test('existing contraction tolerance remains, while wrong names and grammar still fail', () => {
  const taskFor = (id, suffix = 'write') => adaptiveDailyLessons.flatMap(generated).find(task => task.knowledgeIds[0] === id && task.id.endsWith(`-${suffix}`));
  const ben = taskFor('i-am-ben');
  assert.equal(checkDailyAnswer(ben, { ...createDailyDraft(ben), text: 'im ben' }).correct, true);
  assert.equal(checkDailyAnswer(ben, { ...createDailyDraft(ben), text: 'I am Mia.' }).correct, false);
  const teacher = taskFor('he-is-a-teacher');
  assert.equal(checkDailyAnswer(teacher, { ...createDailyDraft(teacher), text: 'hes a teacher' }).correct, true);
  assert.equal(checkDailyAnswer(teacher, { ...createDailyDraft(teacher), text: 'he teacher' }).correct, false);
  const yes = taskFor('yes-i-am');
  assert.equal(checkDailyAnswer(yes, { ...createDailyDraft(yes), text: "Yes, I'm" }).correct, false);
});

test('the same expression and variant keep their signature across later integrated lessons', () => {
  const signatures = new Map();
  for (const lesson of adaptiveDailyLessons) for (const task of generated(lesson)) {
    const variant = task.id.slice(`${lesson.id}-p-${task.knowledgeIds[0]}-`.length);
    const key = `${task.knowledgeIds[0]}:${variant}`;
    if (signatures.has(key)) assert.equal(task.learningSignature, signatures.get(key));
    signatures.set(key, task.learningSignature);
  }
});
