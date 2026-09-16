// Run: node --test tools/test-lesson.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import * as review from '../src/review.ts';

// Compile the real module with the existing TypeScript dependency. Supply the
// actual review module and generated vocabulary, without a DOM or new package.
const source = readFileSync(new URL('../src/lesson.ts', import.meta.url), 'utf8');
const vocabularySource = readFileSync(new URL('../src/vocabulary.ts', import.meta.url), 'utf8');
const vocabulary = JSON.parse(vocabularySource.slice(vocabularySource.indexOf('= [') + 2).trim().replace(/;$/, ''));
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
const lessonModule = { exports: {} };
const requireLesson = path => {
  if (path === './review') return review;
  if (path === './vocabulary') return { vocabulary };
  throw new Error(`Unexpected lesson dependency: ${path}`);
};
new Function('require', 'exports', 'module', compiled)(requireLesson, lessonModule.exports, lessonModule);
const { createLesson, answerLesson, nextLesson, summarizeLesson, buildCloze, buildLessonOptions } = lessonModule.exports;
const at = day => new Date(2026, 8, day, 10).getTime();
const make = (id, word, meaning, example = `The ${word} is here. Use ${word} again.`) => ({ id, word, meaning, example, exampleZh: '明确的例句翻译', category: '测试', phonetic: '', tier: '基础' });
const pool = [make(9001, 'apple', '苹果'), make(9002, 'book', '书本'), make(9003, 'cat', '猫咪'), make(9004, 'desk', '桌子'), make(9005, 'egg', '鸡蛋')];
const resultsFor = (task, outcome = 'independent') => task.words.map(word => ({ wordId: word.id, outcome }));
const answer = (lesson, outcome = 'independent') => nextLesson(answerLesson(lesson, resultsFor(lesson.tasks[lesson.index], outcome)));

test('five words produce the requested ten-task mixed lesson with real three-word pairing', () => {
  const lesson = createLesson(pool, {}, {}, at(14));
  assert.equal(lesson.tasks.length, 10);
  assert.deepEqual(lesson.tasks.map(task => task.kind), ['meaning', 'meaning', 'pairs', 'listen', 'cloze', 'dictation', 'cloze', 'dictation', 'dictation', 'dictation']);
  assert.deepEqual(lesson.tasks[2].words.map(word => word.id), [9003, 9004, 9005]);
  assert.equal(lesson.tasks[2].options.length, 3);
  assert.equal(new Set(lesson.tasks.map(task => task.id)).size, lesson.tasks.length);
  assert.deepEqual(lesson.items, pool);
});

test('each word has one unexposed first encounter and all later practice is exposed', () => {
  const lesson = createLesson(pool, {}, {}, at(14));
  const seen = new Set();
  for (const task of lesson.tasks) {
    for (const evidence of task.evidence) {
      assert.equal(evidence.exposed, seen.has(evidence.wordId));
      seen.add(evidence.wordId);
    }
  }
  assert.equal(seen.size, 5);
  for (const task of lesson.tasks.filter(task => task.kind === 'listen')) {
    assert.equal(task.evidence[0].ability, 'spelling');
    assert.equal(task.evidence[0].exposed, true);
  }
  for (const task of lesson.tasks.filter(task => ['cloze', 'meaning', 'pairs'].includes(task.kind))) {
    assert.ok(task.evidence.every(evidence => evidence.ability === 'meaning'));
  }
});

test('initial choice distractors do not expose future selected words', () => {
  const realPool = [vocabulary[0], vocabulary[1], vocabulary[2], vocabulary[20], vocabulary[28]];
  const lesson = createLesson(realPool, {}, {}, at(14));
  const seen = new Set();
  for (const task of lesson.tasks) {
    const current = new Set(task.words.map(word => word.id));
    if (task.evidence.some(evidence => !evidence.exposed)) {
      for (const option of task.options) {
        assert.ok(!realPool.some(word => word.id === option.id && !current.has(word.id) && !seen.has(word.id)));
      }
    }
    task.words.forEach(word => seen.add(word.id));
  }
});

test('a weak spelling ability gets an unexposed dictation before seeing the word', () => {
  let progress = review.updateReviewProgress({}, { wordId: 9001, ability: 'meaning', level: 0, retry: false }, 'independent', at(13));
  progress = review.updateReviewProgress(progress, { wordId: 9001, ability: 'spelling', level: 0, retry: false }, 'assisted', at(13));
  const lesson = createLesson(pool, progress, {}, at(14));
  assert.equal(lesson.tasks[0].kind, 'dictation');
  assert.equal(lesson.tasks[0].words[0].id, 9001);
  assert.equal(lesson.tasks[0].evidence[0].exposed, false);
  assert.equal(lesson.tasks[0].difficulty, 0);
  assert.equal(lesson.tasks.find(task => task.kind === 'dictation' && task.words[0].id === 9001 && task.evidence[0].exposed).difficulty, 1);
});

test('later harder dictation and listening choices do not inflate spelling progress', () => {
  const lesson = createLesson(pool, {}, {}, at(14));
  let progress = {};
  for (const task of lesson.tasks) {
    for (const evidence of task.evidence) progress = review.updateReviewProgress(progress, evidence, 'independent', at(14));
  }
  for (const word of pool) {
    assert.equal(review.getSkill(progress, word.id, 'meaning').streak, 1);
    assert.equal(review.getSkill(progress, word.id, 'spelling').streak, 0);
    assert.equal(review.getSkill(progress, word.id, 'spelling').level, 0);
  }
});

test('a failed established dictation lowers its remaining practice instead of keeping a harder challenge', () => {
  let progress = {};
  for (const day of [10, 11, 12, 13]) {
    progress = review.updateReviewProgress(progress, { wordId: 9001, ability: 'spelling', level: review.getSkill(progress, 9001, 'spelling').level, retry: false }, 'independent', at(day));
  }
  progress = review.updateReviewProgress(progress, { wordId: 9001, ability: 'meaning', level: 0, retry: false }, 'independent', at(14));
  const lesson = createLesson([pool[0]], progress, {}, at(14));
  assert.deepEqual(lesson.tasks.map(task => [task.kind, task.difficulty]), [['dictation', 2], ['listen', 2], ['dictation', 3]]);
  for (const outcome of ['assisted', 'revealed']) {
    const updated = answerLesson(lesson, resultsFor(lesson.tasks[0], outcome));
    assert.equal(updated.tasks[0].difficulty, 2);
    assert.equal(updated.results[0].task.difficulty, 2);
    assert.equal(updated.tasks[2].difficulty, 1);
    assert.equal(updated.tasks[2].evidence[0].level, 1);
    assert.equal(lesson.tasks[2].difficulty, 3);
  }
});

test('a failed harder challenge reduces future dictation to the established level and preserves other words', () => {
  let progress = {};
  for (const word of pool) {
    for (const day of [10, 11, 12, 13]) {
      progress = review.updateReviewProgress(progress, { wordId: word.id, ability: 'spelling', level: review.getSkill(progress, word.id, 'spelling').level, retry: false }, 'independent', at(day));
    }
    progress = review.updateReviewProgress(progress, { wordId: word.id, ability: 'meaning', level: 0, retry: false }, 'independent', at(14));
  }
  let lesson = createLesson(pool, progress, {}, at(14));
  const targetIndex = lesson.tasks.findIndex(task => task.kind === 'dictation' && task.words[0].id === 9001 && task.difficulty === 3);
  assert.ok(targetIndex > 0);
  while (lesson.index < targetIndex) lesson = answer(lesson);
  const challenge = lesson.tasks[targetIndex];
  const before = structuredClone(lesson);
  const updated = answerLesson(lesson, resultsFor(challenge, 'revealed'));
  const later = updated.tasks.find(task => task.retry && task.words[0].id === 9001);
  assert.equal(later.difficulty, 2);
  assert.equal(later.evidence[0].level, 2);
  assert.equal(updated.tasks[targetIndex].difficulty, 3);
  for (const task of before.tasks.filter(task => !task.words.some(word => word.id === 9001))) {
    assert.deepEqual(updated.tasks.find(candidate => candidate.id === task.id), task);
  }
  assert.deepEqual(lesson, before);
});

test('meaning mistakes do not reduce planned spelling difficulty', () => {
  const lesson = createLesson(pool, {}, {}, at(14));
  const before = lesson.tasks.filter(task => task.kind === 'dictation');
  const updated = answerLesson(lesson, resultsFor(lesson.tasks[0], 'revealed'));
  for (const task of before) assert.deepEqual(updated.tasks.find(candidate => candidate.id === task.id), task);
});

test('pairing records each word separately and rejects incomplete or duplicated results', () => {
  let lesson = createLesson(pool, {}, {}, at(14));
  lesson = answer(answer(lesson));
  const pairTask = lesson.tasks[lesson.index];
  assert.equal(pairTask.kind, 'pairs');
  assert.throws(() => answerLesson(lesson, [{ wordId: 9003, outcome: 'independent' }]));
  assert.throws(() => answerLesson(lesson, [{ wordId: 9003, outcome: 'independent' }, { wordId: 9003, outcome: 'revealed' }, { wordId: 9005, outcome: 'assisted' }]));
  const submitted = answerLesson(lesson, [{ wordId: 9003, outcome: 'independent' }, { wordId: 9004, outcome: 'assisted' }, { wordId: 9005, outcome: 'revealed' }]);
  assert.equal(submitted.index, lesson.index);
  assert.equal(submitted.results.at(-1).answers.length, 3);
  assert.match(summarizeLesson(submitted, 9003).meaning, /独立辨认/);
  assert.match(summarizeLesson(submitted, 9004).meaning, /借助提示/);
  assert.match(summarizeLesson(submitted, 9005).meaning, /已看答案/);
  assert.equal(submitted.tasks.filter(task => task.retry).length, 2);
});

test('single, two, three and four-word pools stay valid without self-answering one-pair tasks', () => {
  for (let size = 0; size <= 4; size++) {
    let lesson = createLesson(pool.slice(0, size), {}, {}, at(14));
    assert.equal(lesson.items.length, size);
    assert.ok(lesson.tasks.length < 10);
    assert.ok(lesson.tasks.every(task => task.kind !== 'pairs' || task.words.length >= 2));
    assert.ok(lesson.tasks.every(task => task.kind === 'dictation' || task.options.length >= 2));
    while (!lesson.finished) lesson = answer(lesson, 'assisted');
    assert.ok(lesson.tasks.length <= 15);
    if (size === 1) assert.equal(lesson.tasks.filter(task => task.retry).length, 0);
  }
});

test('overlapping pair meanings are split into unambiguous individual tasks', () => {
  const overlapping = pool.map((word, index) => index < 2 ? word : { ...word, meaning: '代码仓库' });
  const lesson = createLesson(overlapping, {}, {}, at(14));
  assert.equal(lesson.tasks.length, 10);
  assert.equal(lesson.tasks.some(task => task.kind === 'pairs'), false);
  assert.equal(lesson.tasks.filter(task => task.evidence.some(evidence => !evidence.exposed)).length, 5);
});

test('unlimited mistakes still create no more than one spaced retry per word and fifteen tasks', () => {
  let lesson = createLesson(pool, {}, {}, at(14));
  const original = structuredClone(lesson);
  let steps = 0;
  while (!lesson.finished && steps++ < 30) lesson = answer(lesson, 'revealed');
  assert.equal(lesson.finished, true);
  assert.equal(lesson.tasks.length, 15);
  assert.equal(original.tasks.length, 10);
  assert.equal(original.results.length, 0);
  const retries = lesson.tasks.filter(task => task.retry);
  assert.equal(new Set(retries.map(task => task.words[0].id)).size, retries.length);
  for (let index = 0; index < lesson.tasks.length; index++) {
    const task = lesson.tasks[index];
    if (!task.retry) continue;
    assert.equal(lesson.tasks[index - 1].words.some(word => word.id === task.words[0].id), false);
    assert.ok(task.evidence.every(evidence => evidence.retry && evidence.exposed));
  }
});

test('meaning correction changes exercise form and dictation correction supplies an easier level', () => {
  let lesson = createLesson(pool, {}, {}, at(14));
  lesson = answer(lesson, 'assisted');
  const retryMeaning = lesson.tasks.find(task => task.retry && task.words[0].id === 9001);
  assert.equal(retryMeaning.kind, 'cloze');
  while (lesson.index < 5) lesson = answer(lesson);
  assert.equal(lesson.tasks[5].kind, 'dictation');
  lesson = answer(lesson, 'revealed');
  const retrySpelling = lesson.tasks.find(task => task.retry && task.words[0].id === 9003);
  assert.equal(retrySpelling.kind, 'dictation');
  assert.equal(retrySpelling.difficulty, 0);
  assert.ok(retrySpelling.difficulty < lesson.tasks[5].difficulty);
});

test('the last word error waits for another session when no different word can intervene', () => {
  let lesson = createLesson(pool, {}, {}, at(14));
  while (lesson.index < 9) lesson = answer(lesson);
  lesson = answer(lesson, 'assisted');
  assert.equal(lesson.finished, true);
  assert.equal(lesson.tasks.length, 10);
});

test('Next requires an answer and duplicate submission is ignored', () => {
  const lesson = createLesson(pool, {}, {}, at(14));
  assert.equal(nextLesson(lesson), lesson);
  const submitted = answerLesson(lesson, resultsFor(lesson.tasks[0]));
  assert.equal(submitted.index, 0);
  assert.equal(answerLesson(submitted, resultsFor(lesson.tasks[0], 'revealed')), submitted);
  assert.equal(nextLesson(submitted).index, 1);
});

test('cloze masks every exact occurrence, case-insensitively, without stemming', () => {
  assert.equal(buildCloze(make(1, 'branch', '分支', 'Branch, branch and BRANCH.')), '____, ____ and ____.');
  assert.equal(buildCloze(make(1, 'run', '运行', 'running runners outrun _run run2.')), null);
  assert.equal(buildCloze(make(1, 'pull request', '拉取请求', 'Open a pull   request, then review the pull request.')), 'Open a ____, then review the ____.');
  assert.equal(buildCloze(make(1, 'a.b', '测试', 'Use axb only.')), null);
  assert.equal(buildCloze(make(1, 'C++', '语言', 'C++ and C++ tools.')), '____ and ____ tools.');
});

test('annotated abbreviation cloze handles literal parentheses and masks both full name and abbreviation', () => {
  const word = 'universal serial bus (USB)';
  assert.equal(buildCloze(make(1, word, '通用串行总线', 'USB means universal serial bus. USB is common.')), '____ means ____. ____ is common.');
  assert.equal(buildCloze(make(1, word, '通用串行总线', 'Use universal serial bus (USB) today.')), 'Use ____ today.');
  assert.equal(buildCloze(make(1, 'word (noun)', '词', 'Use the word.')), null);
  assert.equal(buildCloze(make(1, 'regular expression (regex)', '正则表达式', 'Use regex.')), null);
});

test('choice options exclude overlaps, duplicates and broad multiple meanings, with a maximum of three', () => {
  const target = pool[0];
  const candidates = [
    make(10, 'APPle', '不同文字'), make(11, 'red apple', '红苹果'),
    make(12, 'polysemy', '提交；合并；运行；保存'), pool[1], pool[2], pool[3],
  ];
  const options = buildLessonOptions(target, candidates);
  assert.equal(options.length, 3);
  assert.deepEqual(new Set(options.map(word => word.id)), new Set([9001, 9002, 9003]));
  assert.equal(buildLessonOptions(target, [target]).length, 1);
});

test('summaries do not claim independent dictation from listening recognition or exposed follow-ups', () => {
  let lesson = createLesson(pool, {}, {}, at(14));
  while (lesson.index < 4) lesson = answer(lesson);
  assert.match(summarizeLesson(lesson, 9001).spelling, /听音选出单词，完整听写留待后续练习/);
  while (!lesson.finished) lesson = answer(lesson);
  assert.match(summarizeLesson(lesson, 9001).meaning, /独立辨认/);
  assert.match(summarizeLesson(lesson, 9001).spelling, /本轮看过该词后/);
  assert.doesNotMatch(summarizeLesson(lesson, 9001).spelling, /完整拼写能独立完成/);
});

test('known identical pronunciations are not used as listening-choice distractors', () => {
  const write = { ...make(1, 'write', '写入'), phonetic: 'raɪt' };
  const right = { ...make(2, 'right', '正确的'), phonetic: '/raɪt/' };
  const options = buildLessonOptions(write, [right, ...pool]);
  assert.equal(options.some(word => word.id === right.id), false);
  assert.equal(options.length, 3);
});
