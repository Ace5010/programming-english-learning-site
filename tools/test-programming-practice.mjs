import test from 'node:test';
import assert from 'node:assert/strict';
import { statSync } from 'node:fs';
import { adaptiveProgrammingUnits, adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { programmingLessons } from '../src/programmingCourse.ts';
import { vocabulary } from '../src/vocabulary.ts';
import { checkDailyAnswer, createDailyDraft, normalizeDailyAnswer } from '../src/dailyProgress.ts';

const byId = new Map(vocabulary.map(item => [item.id, item]));
const practice = adaptiveProgrammingLessons.flatMap(lesson => lesson.practice);

test('adaptive candidates preserve existing teaching and stable historical exercise references', () => {
  assert.equal(adaptiveProgrammingUnits.length, 4);
  assert.equal(adaptiveProgrammingLessons.length, 24);
  const allIds = new Set(programmingLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks].map(task => task.id)));
  for (const [index, lesson] of adaptiveProgrammingLessons.entries()) {
    const original = programmingLessons[index];
    assert.equal(lesson.id, original.id);
    for (const key of ['exercises', 'rechecks']) {
      assert.deepEqual(lesson[key].map(({ learningDifficulty, learningSignature, ...task }) => task), original[key]);
      for (const task of lesson[key]) {
        assert.ok(['recognition', 'context', 'recall'].includes(task.learningDifficulty));
        assert.equal(task.learningSignature, `authored:${task.id}`);
      }
    }
    assert.strictEqual(lesson.phrases, original.phrases);
    assert.equal(lesson.explanation, original.explanation);
    assert.deepEqual(lesson.learningTargets, lesson.wordIds.map(id => `word-${id}`));
    assert.equal(lesson.learningGoal, 'reading');
    for (const task of lesson.practice) {
      assert.ok(!allIds.has(task.id), task.id); allIds.add(task.id);
      assert.ok(task.id.startsWith(`${lesson.id}-p-`));
      assert.equal(task.wordIds.length, 1);
      assert.ok(lesson.wordIds.includes(task.wordIds[0]), task.id);
      assert.deepEqual(task.knowledgeIds, [`word-${task.wordIds[0]}`]);
      assert.ok(['recognition', 'context', 'recall'].includes(task.learningDifficulty));
      assert.ok(task.learningSignature.startsWith(`word-${task.wordIds[0]}:`));
    }
  }
});

test('every target offers distinct recognition, context, listening and recall candidates', () => {
  for (const lesson of adaptiveProgrammingLessons) for (const id of lesson.wordIds) {
    const candidates = lesson.practice.filter(task => task.wordIds[0] === id);
    assert.ok(candidates.length >= 6, `${lesson.id}: ${id}`);
    assert.equal(new Set(candidates.map(task => task.learningSignature)).size, candidates.length);
    const count = Object.fromEntries(['meaning', 'context', 'listening', 'spelling'].map(ability => [ability, candidates.filter(task => task.ability === ability).length]));
    assert.ok(count.context > count.listening && count.meaning >= 1 && count.spelling >= 1 && count.listening >= 1);
    assert.ok(candidates.some(task => task.learningDifficulty === 'recognition'));
    assert.ok(candidates.some(task => task.learningDifficulty === 'context'));
    assert.ok(candidates.some(task => task.learningDifficulty === 'recall'));
    assert.ok(candidates.every(task => !task.required && !task.repeatCount), 'the pool must not prescribe fixed repetitions');
  }
});

test('every generated answer works with shared matching and every distractor is rejected', () => {
  const positions = [0, 0, 0];
  for (const task of practice) {
    const answer = createDailyDraft(task);
    assert.equal(checkDailyAnswer(task, answer).correct, false, `${task.id}: empty`);
    if (task.kind === 'fill') {
      answer.blanks = task.blanks.map(choices => choices[0]);
      assert.equal(task.parts.length, task.blanks.length + 1);
      const wrong = createDailyDraft(task); wrong.blanks = ['zzzzz'];
      assert.equal(checkDailyAnswer(task, wrong).correct, false, task.id);
    } else {
      assert.equal(task.options.length, 3, task.id);
      assert.equal(new Set(task.options.map(normalizeDailyAnswer)).size, 3, task.id);
      answer.choice = task.answers[0];
      const index = task.options.indexOf(answer.choice);
      assert.ok(index >= 0); positions[index]++;
      for (const option of task.options.filter(value => value !== answer.choice)) {
        const wrong = createDailyDraft(task); wrong.choice = option;
        assert.equal(checkDailyAnswer(task, wrong).correct, false, `${task.id}: ${option}`);
      }
    }
    assert.equal(checkDailyAnswer(task, answer).correct, true, task.id);
  }
  const choiceCount = positions.reduce((sum, value) => sum + value, 0);
  assert.ok(positions.every(value => value > choiceCount / 5 && value < choiceCount / 2), JSON.stringify(positions));
});

test('all English sentences and recordings reuse the actual vocabulary with no invented audio', () => {
  for (const lesson of adaptiveProgrammingLessons) for (const task of lesson.practice) {
    const word = byId.get(task.wordIds[0]);
    assert.ok(word);
    if (task.id.endsWith('-sentence')) {
      assert.ok(task.prompt.endsWith(word.example));
      assert.deepEqual(task.answers, [word.exampleZh]);
    }
    if (task.id.endsWith('-translation')) {
      assert.ok(task.prompt.endsWith(word.exampleZh));
      assert.deepEqual(task.answers, [word.example]);
      for (const option of task.options) assert.ok(vocabulary.some(item => item.example === option), option);
    }
    if (task.id.endsWith('-cloze')) {
      const withBlank = task.prompt.split('\n').at(-1);
      assert.equal(withBlank.replace('____', task.answers[0]), word.example, task.id);
      assert.ok(task.prompt.includes(word.exampleZh));
      assert.equal(task.audioId, undefined, 'missing word must not be revealed by a recording');
    }
    if (task.kind === 'fill') {
      const full = task.parts.map((part, index) => part + (task.blanks[index]?.[0] ?? '')).join('');
      assert.equal(full, word.example, task.id);
      assert.equal(task.audioId, undefined);
    }
    if (task.audioId) {
      assert.equal(task.kind, 'listen');
      assert.equal(task.audioId, `word-${word.id}`);
      assert.ok(lesson.phrases.some(phrase => phrase.id === task.audioId && phrase.en === word.word));
      for (const voice of ['aria', 'guy']) assert.ok(statSync(new URL(`../public/audio/${voice}/${task.audioId}.mp3`, import.meta.url)).size > 0);
    }
  }
});

test('distractors use previously introduced words and do not confuse known near synonyms', () => {
  const taught = new Set();
  const avoid = [ ['repository', 'project'], ['clone', 'fork'], ['branch', 'main'], ['folder', 'directory'], ['parameter', 'argument'], ['function', 'method'], ['error', 'bug'], ['request', 'pull request'], ['package', 'dependency', 'module'] ];
  for (const lesson of adaptiveProgrammingLessons) {
    for (const id of lesson.wordIds) taught.add(id);
    for (const task of lesson.practice.filter(task => /-(word|listen|cloze)$/.test(task.id))) {
      const target = byId.get(task.wordIds[0]);
      for (const option of task.options) {
        const item = vocabulary.find(word => word.word.toLowerCase() === option.toLowerCase());
        assert.ok(item && taught.has(item.id), `${task.id}: untaught ${option}`);
        if (item.id !== target.id) assert.ok(!avoid.some(group => group.includes(target.word) && group.includes(item.word)), `${task.id}: ${option}`);
      }
    }
  }
});

test('candidate content and signatures stay stable across repeated construction', async () => {
  const reloaded = await import(`../src/programmingPractice.ts?fresh=1`);
  assert.deepEqual(reloaded.adaptiveProgrammingLessons, adaptiveProgrammingLessons);
  const signatures = new Map();
  for (const task of practice) {
    const previous = signatures.get(task.learningSignature);
    if (previous) {
      assert.deepEqual(task.answers, previous.answers);
      assert.deepEqual(task.blanks, previous.blanks);
      assert.equal(task.ability, previous.ability);
    }
    signatures.set(task.learningSignature, task);
  }
});
