import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { programmingUnits, programmingLessons, programmingPhrases } from '../src/programmingCourse.ts';
import { vocabulary } from '../src/vocabulary.ts';
import { createDailyDraft, checkDailyAnswer, normalizeDailyAnswer } from '../src/dailyProgress.ts';

const byId = new Map(vocabulary.map(item => [item.id, item]));
const allExercises = programmingLessons.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks]);
const lessonIds = new Set();

function solveOrder(task) {
  // Tiles may be full instructions; splitting the answer into individual words
  // would not exercise the command-ordering contract of the shared renderer.
  const visit = (selected, remaining) => {
    const sentence = selected.map(index => task.options[index]).join(' ');
    if (task.answers.some(answer => answer === sentence)) return selected;
    if (!task.answers.some(answer => answer.startsWith(sentence))) return null;
    for (const index of remaining) {
      const solution = visit([...selected, index], remaining.filter(value => value !== index));
      if (solution) return solution;
    }
    return null;
  };
  return visit([], task.options.map((_, index) => index));
}

test('four complete programming units teach 24 lessons with distinct stable tasks', () => {
  assert.equal(programmingUnits.length, 4);
  assert.equal(programmingLessons.length, 24);
  const taskIds = new Set();
  const prompts = new Set();
  for (const unit of programmingUnits) {
    assert.equal(unit.lessons.length, 6, unit.id);
    assert.ok(unit.goal && unit.description);
    for (const lesson of unit.lessons) {
      assert.ok(!lessonIds.has(lesson.id), lesson.id); lessonIds.add(lesson.id);
      assert.ok(lesson.explanation.length >= 100 && lesson.goal.length > 8, lesson.id);
      assert.ok(lesson.wordIds.length >= 2 && lesson.phrases.length >= 4, lesson.id);
      assert.equal(lesson.exercises.length, 5, lesson.id);
      assert.equal(lesson.rechecks.length, 2, lesson.id);
      for (const task of [...lesson.exercises, ...lesson.rechecks]) {
        assert.ok(!taskIds.has(task.id), task.id); taskIds.add(task.id);
        assert.ok(task.prompt && task.explanation.length > 10, task.id);
        if (task.kind !== 'listen') {
          assert.ok(!prompts.has(task.prompt), `Repeated question: ${task.id}`);
          prompts.add(task.prompt);
        }
        assert.ok(task.wordIds.length > 0, task.id);
        assert.equal(new Set(task.wordIds).size, task.wordIds.length, task.id);
        assert.deepEqual(task.knowledgeIds, task.wordIds.map(id => `word-${id}`), task.id);
      }
    }
  }
  assert.equal(taskIds.size, 168);
});

test('all tested vocabulary is taught first and unit six adds no new core terms', () => {
  const taught = new Set();
  const tested = new Set();
  for (const unit of programmingUnits) for (const [index, lesson] of unit.lessons.entries()) {
    const newlyTaught = lesson.wordIds.filter(id => !taught.has(id));
    if (index === 5) assert.equal(newlyTaught.length, 0, `${lesson.id} should integrate earlier material`);
    else assert.ok(newlyTaught.length >= 2 && newlyTaught.length <= 4, `${lesson.id}: too much or no new material`);
    for (const id of lesson.wordIds) {
      assert.ok(byId.has(id));
      assert.ok(lesson.phrases.some(phrase => phrase.id === `word-${id}`));
      assert.ok(lesson.phrases.some(phrase => phrase.id === `example-${id}`));
      taught.add(id);
    }
    for (const task of [...lesson.exercises, ...lesson.rechecks]) for (const id of task.wordIds) {
      assert.ok(taught.has(id), `${task.id}: ${byId.get(id)?.word ?? id} not taught`);
      tested.add(id);
    }
  }
  assert.deepEqual([...tested].sort((a, b) => a - b), [...taught].sort((a, b) => a - b), 'every taught core term receives a real exercise');
  const required = [
    'repository', 'project', 'code', 'readme', 'clone', 'fork', 'branch', 'checkout', 'main', 'change', 'commit', 'message', 'push', 'pull', 'remote', 'origin',
    'function', 'variable', 'constant', 'parameter', 'argument', 'return', 'class', 'object', 'array', 'string', 'boolean', 'integer', 'loop', 'condition', 'method', 'property',
    'file', 'folder', 'directory', 'path', 'terminal', 'command', 'package', 'install', 'dependency', 'build', 'run', 'compile', 'script', 'environment', 'configuration',
    'error', 'bug', 'warning', 'debug', 'test', 'fail', 'pass', 'fix', 'issue', 'log',
  ];
  for (const name of required) assert.ok([...taught].some(id => byId.get(id).word === name), `${name} required by course scope`);
});

test('teaching text and all playback IDs exactly match existing vocabulary audio', () => {
  assert.equal(new Set(programmingPhrases.map(phrase => phrase.id)).size, programmingPhrases.length);
  const manifest = JSON.parse(readFileSync(new URL('../public/audio/neural-manifest.json', import.meta.url), 'utf8'));
  for (const phrase of programmingPhrases) {
    const match = /^(word|example)-(\d+)$/.exec(phrase.id);
    assert.ok(match, phrase.id);
    const word = byId.get(Number(match[2]));
    assert.ok(word, phrase.id);
    const text = match[1] === 'word' ? word.word : word.example;
    assert.equal(phrase.en, text, phrase.id);
    assert.equal(phrase.zh, match[1] === 'word' ? word.meaning : word.exampleZh, phrase.id);
    for (const voice of ['aria', 'guy']) {
      const name = `${voice}/${phrase.id}.mp3`;
      const path = new URL(`../public/audio/${name}`, import.meta.url);
      assert.ok(statSync(path).size > 0, name);
      if (manifest[name]) assert.equal(manifest[name].text, text, `${name} recording text`);
      else assert.ok(match[1] === 'word' && word.id <= 3560, `${name}: only legacy word audio may lack a text manifest`);
      if (manifest[name]?.fileSha256) assert.equal(createHash('sha256').update(readFileSync(path)).digest('hex'), manifest[name].fileSha256, name);
    }
  }
  for (const lesson of programmingLessons) for (const task of [...lesson.exercises, ...lesson.rechecks]) {
    if (task.kind === 'listen') assert.ok(task.audioId, task.id);
    if (task.audioId) assert.ok(lesson.phrases.some(phrase => phrase.id === task.audioId), task.id);
  }
});

test('every task is solvable by the shared answer checker and rejects an empty or wrong answer', () => {
  for (const task of allExercises) {
    const draft = createDailyDraft(task);
    const wrong = createDailyDraft(task);
    if (task.kind === 'choice' || task.kind === 'listen') {
      const matching = task.options.filter(option => task.answers.some(answer => normalizeDailyAnswer(option) === normalizeDailyAnswer(answer)));
      assert.equal(matching.length, 1, task.id);
      assert.equal(new Set(task.options).size, task.options.length, task.id);
      draft.choice = matching[0];
      wrong.choice = task.options.find(option => option !== matching[0]);
    } else if (task.kind === 'order') {
      const solution = solveOrder(task);
      assert.ok(solution, task.id);
      draft.order = solution;
      wrong.order = [...solution].reverse();
      assert.notDeepEqual(wrong.order, solution);
    } else if (task.kind === 'fill') {
      assert.equal(task.parts.length, task.blanks.length + 1, task.id);
      assert.ok(task.blanks.every(values => values.length && values.every(Boolean)));
      draft.blanks = task.blanks.map(values => values[0]);
      wrong.blanks = task.blanks.map(() => 'zzzzz');
    } else if (task.kind === 'write') {
      draft.text = task.answers[0];
      wrong.text = 'zzzzz';
    } else assert.fail(`Unsupported programming task ${task.kind}`);
    assert.equal(checkDailyAnswer(task, draft).correct, true, task.id);
    assert.equal(checkDailyAnswer(task, wrong).correct, false, `${task.id}: wrong answer`);
    assert.equal(checkDailyAnswer(task, createDailyDraft(task)).correct, false, `${task.id}: empty answer`);
  }
});

test('reading dominates meaning, spelling and listening; first encounter has no long blind spelling', () => {
  const count = Object.fromEntries(['context', 'meaning', 'spelling', 'listening'].map(ability => [ability, allExercises.filter(task => task.ability === ability).length]));
  assert.ok(count.context > count.meaning && count.meaning > count.spelling && count.spelling > count.listening);
  assert.ok(count.context > allExercises.length / 2);
  assert.ok(count.listening > 0);
  assert.ok(!allExercises.some(task => task.kind === 'speak'));
  assert.deepEqual([...new Set(allExercises.map(task => task.kind))].sort(), ['choice', 'fill', 'listen', 'order', 'write']);
  assert.ok(programmingLessons[0].exercises.every(task => !['write', 'fill'].includes(task.kind)));
  assert.ok(programmingLessons[0].exercises.some(task => task.ability === 'meaning'));
  assert.ok(programmingLessons[0].exercises.some(task => task.ability === 'context'));
  for (const unit of programmingUnits) assert.ok(unit.lessons[5].exercises.every(task => task.ability === 'context'));
});

test('choice answers occupy every position and command tiles are not systematically pre-solved', () => {
  const positions = [0, 0, 0];
  const choices = allExercises.filter(task => task.kind === 'choice' || task.kind === 'listen');
  for (const task of choices) positions[task.options.indexOf(task.answers[0])]++;
  assert.ok(positions.every(count => count > choices.length / 5 && count < choices.length / 2), JSON.stringify(positions));
  const order = allExercises.filter(task => task.kind === 'order');
  assert.ok(order.some(task => task.options.join(' ') !== task.answers[0]));
});

test('new reading contexts cover negation, direction, code roles and real error messages', () => {
  const prompts = allExercises.map(task => task.prompt).join('\n');
  for (const reading of ['Not pushed.', 'did not pass', 'Permission denied.', "Cannot find module 'react'.", 'a dependency is missing', 'All tests passed.', 'function greet(name)', 'greet("Kai")', 'pull request', 'git pull origin main']) {
    assert.ok(prompts.includes(reading), reading);
  }
  assert.ok(allExercises.some(task => task.kind === 'order' && task.options.every(option => option.includes(' '))));
});
