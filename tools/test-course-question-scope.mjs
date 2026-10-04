import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptiveProgrammingLessons as catalog } from '../src/programmingPractice.ts';
import { createDailyProgress, updateDailyDraft, submitDailyAnswer, markDailyHelp, parseDailyProgress } from '../src/dailyProgress.ts';
import { planAdaptiveSession, beginAdaptiveLearning, resolveAdaptiveLesson, recordAdaptiveAnswer, advanceAdaptiveSession } from '../src/adaptiveLearning.ts';
import { correctDraft } from './helpers/course-answer.mjs';

const at = new Date(2026, 8, 29, 10).getTime();
const current = (progress, lessons) => resolveAdaptiveLesson(progress.session, lessons).exercises.find(task => task.id === progress.session.queue[progress.session.index].exerciseId);
function start(lessons, seed = .37) {
  const progress = createDailyProgress();
  progress.session = planAdaptiveSession(progress, lessons, at, () => seed);
  return beginAdaptiveLearning(progress, lessons, at);
}
function answer(progress, lessons, helped = false) {
  const lesson = resolveAdaptiveLesson(progress.session, lessons), task = current(progress, lessons);
  let next = { ...progress, session: updateDailyDraft(progress.session, correctDraft(task)) };
  if (helped) next = markDailyHelp(next, lesson, true, at);
  return recordAdaptiveAnswer(submitDailyAnswer(next, lesson, {}, at), lessons, at);
}

test('later variants of an early word require all their English distractors, not their authored lesson position', () => {
  const earlier = catalog[0].learningTargets;
  const leaked = catalog.slice(1).flatMap(lesson => lesson.practice).find(task =>
    task.kind === 'choice' && task.id.endsWith('-word') && earlier.includes(task.knowledgeIds[0])
    && task.prerequisiteIds.some(id => !earlier.includes(id)));
  assert.ok(leaked, 'regression must include an actual formerly leaking candidate');
  for (const seed of [.01, .19, .37, .51, .79, .99]) {
    let progress = start(catalog, seed), questions = 0;
    while (progress.session.stage === 'exercise') {
      const task = current(progress, catalog);
      const taught = new Set(Object.keys(progress.learning.targets));
      assert.ok(task.knowledgeIds.every(id => taught.has(id)), task.id);
      assert.ok(task.prerequisiteIds.every(id => taught.has(id)), `${task.id} has untaught distractors or context`);
      assert.notEqual(task.id, leaked.id);
      progress = answer(progress, catalog);
      progress = advanceAdaptiveSession(parseDailyProgress(JSON.stringify(progress), catalog).progress, catalog, at);
      questions++;
    }
    assert.ok(questions >= 4 && questions <= 20);
  }
});

test('supporting words get Chinese meanings while the assessed technical word stays hidden', () => {
  const task = catalog[0].practice.find(task => task.id.endsWith('-20-sentence'));
  assert.ok(task.prompt.includes('Read the README for help.'));
  assert.deepEqual(task.supportWords.map(word => word.en.toLowerCase()), ['read', 'the', 'for', 'help']);
  assert.ok(task.supportWords.every(word => word.zh && word.en.toLowerCase() !== 'readme'));
  const command = catalog.find(lesson => lesson.id === 'P1-01-03').exercises.find(task => task.id.endsWith('-e02'));
  assert.ok(command.supportWords.some(word => word.en === 'git' && word.zh.includes('版本管理')));
  assert.equal(command.supportWords.some(word => ['checkout', 'main'].includes(word.en.toLowerCase())), false);
});

const allTasks = catalog.flatMap(lesson => [...lesson.exercises, ...lesson.rechecks, ...lesson.practice]);
const glossOf = (task, word) => task.supportWords?.find(entry => entry.en.toLowerCase() === word)?.zh;

test('function parameters are explained as identifiers while prose keeps its article meaning', () => {
  const code = allTasks.find(task => task.id === 'P1-02-02-r02');
  assert.ok(code.prompt.includes('function add(a, b)'));
  for (const parameter of ['a', 'b']) {
    assert.match(glossOf(code, parameter), /参数名/);
    assert.doesNotMatch(glossOf(code, parameter), /一个|冠词/);
  }
  const prose = allTasks.filter(task => glossOf(task, 'a') && !task.prompt.includes('function'));
  assert.ok(prose.length > 0);
  for (const task of prose) assert.match(glossOf(task, 'a'), /一个/);
});

test('"The server is down." explains down as unavailable, never as a direction, in every variant built from it', () => {
  // The sentence is confirmed by hand from the authored example, not read back from the generator.
  const variants = allTasks.filter(task => JSON.stringify(task).includes('The server is down.'));
  assert.ok(variants.length >= 8, `expected the authored sentence to back several variants, got ${variants.length}`);
  for (const task of variants) {
    const gloss = glossOf(task, 'down');
    if (!gloss) continue; // a variant that does not display the word cannot mis-teach it
    assert.match(gloss, /无法正常运行|停机/, `${task.id} still teaches a literal direction for down`);
    assert.doesNotMatch(gloss, /^向/, `${task.id} kept the generic directional gloss`);
  }
  // The generic sense is not replaced everywhere: `down` keeps 向下 elsewhere.
  const literal = allTasks.find(task => JSON.stringify(task).includes('scroll down'));
  if (literal) assert.doesNotMatch(glossOf(literal, 'down') ?? '', /无法正常运行|停机/);
});

test('other context-only meanings stay scoped to their own sentence', () => {
  const setUp = allTasks.filter(task => JSON.stringify(task).includes('Set up the test environment.'));
  assert.ok(setUp.some(task => /配置|搭好/.test(glossOf(task, 'up') ?? '')), 'set up must not read as a direction');
  const thereIs = allTasks.filter(task => JSON.stringify(task).includes('There is an error here.'));
  assert.ok(thereIs.length >= 3);
  for (const task of thereIs) {
    const gloss = glossOf(task, 'there');
    if (!gloss) continue;
    assert.ok(/存在|有/.test(gloss), `${task.id} explains "there is" as a place`);
  }
  // `found` covers both "File not found." and "I found a bug".
  const found = allTasks.filter(task => /found/i.test(JSON.stringify(task)) && glossOf(task, 'found'));
  assert.ok(found.length > 0);
  for (const task of found) assert.match(glossOf(task, 'found'), /find|找到/);
});

test('no supporting gloss anywhere reveals the answer that question is asking for', () => {
  let checked = 0;
  for (const task of allTasks) {
    if (!task.supportWords?.length) continue;
    const answers = [...(task.answers ?? []), ...((task.blanks ?? []).flat()), ...((task.pairs ?? []).map(pair => pair.en))]
      .map(value => String(value).trim().toLowerCase());
    for (const entry of task.supportWords) {
      checked++;
      assert.ok(!answers.includes(entry.en.trim().toLowerCase()), `${task.id} glosses its own answer: ${entry.en}`);
    }
  }
  assert.ok(checked > 500, `expected to inspect the real question bank, saw ${checked} glosses`);
});

test('a choice question whose answer is a visible English word does not explain that word', () => {
  const naming = catalog.flatMap(lesson => lesson.exercises).find(task => task.id === 'P1-02-04-e05');
  assert.ok(naming.prompt.includes('Change the name property'));
  assert.deepEqual(naming.answers, ['name']);
  assert.equal(glossOf(naming, 'name'), undefined);
  const counting = catalog.flatMap(lesson => lesson.exercises).find(task => task.id === 'P1-02-06-e05');
  assert.deepEqual(counting.answers, ['count']);
  assert.equal(glossOf(counting, 'count'), undefined);
});

const lesson = {
  id: 'scope-fixture', title: 'fixture', goal: '', explanation: '', learningGoal: 'reading', learningTargets: ['word-1', 'word-2'],
  phrases: [{ id: 'word-1', en: 'one', zh: '一' }, { id: 'word-2', en: 'two', zh: '二' }], rechecks: [],
  exercises: [], practice: [
    { id: 'read', kind: 'choice', prompt: 'One sentence.', options: ['right', 'wrong'], answers: ['right'], explanation: '', knowledgeIds: ['word-1'], ability: 'context', learningDifficulty: 'context', learningSignature: 'read-sentence', learningContext: 'sentence:one sentence.' },
    { id: 'reordered', kind: 'order', prompt: 'Same sentence.', options: ['sentence.', 'One'], answers: ['One sentence.'], explanation: '', knowledgeIds: ['word-1'], ability: 'context', learningDifficulty: 'context', learningSignature: 'reorder-sentence', learningContext: 'sentence:one sentence.' },
    { id: 'duplicate', kind: 'choice', prompt: 'One sentence.', options: ['wrong', 'right'], answers: ['right'], explanation: '', knowledgeIds: ['word-1'], ability: 'context', learningDifficulty: 'context', learningSignature: 'read-sentence', learningContext: 'sentence:one sentence.' },
    { id: 'different', kind: 'choice', prompt: 'Two sentences.', options: ['right', 'wrong'], answers: ['right'], explanation: '', knowledgeIds: ['word-2'], ability: 'context', learningDifficulty: 'context', learningSignature: 'different', learningContext: 'sentence:two sentences.' },
  ],
};
function withRead() {
  const progress = start([lesson], 0);
  assert.equal(current(progress, [lesson]).id, 'read');
  return progress;
}

test('a correct sentence is not retested by a new ID, shuffled options or another format after reload', () => {
  const done = answer(withRead(), [lesson]);
  for (const seed of [0, .5, .999]) {
    const parsed = parseDailyProgress(JSON.stringify(done), [lesson]);
    assert.equal(parsed.writable, true, parsed.warning);
    const next = advanceAdaptiveSession(parsed.progress, [lesson], at, () => seed);
    assert.equal(current(next, [lesson]).id, 'different');
  }
  const next = advanceAdaptiveSession(done, [lesson], at, () => 0);
  const finished = advanceAdaptiveSession(answer(next, [lesson]), [lesson], at);
  assert.equal(finished.session.stage, 'summary', 'End the round when only successful repeats remain');
  assert.equal(finished.session.answers.length, 2);
});

test('needing help still leaves another format available for targeted practice', () => {
  const done = answer(withRead(), [lesson], true);
  const next = advanceAdaptiveSession(done, [lesson], at, () => 0);
  assert.equal(current(next, [lesson]).id, 'reordered');
});
