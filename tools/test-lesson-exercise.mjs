// Run: node --test tools/test-lesson-exercise.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import ts from 'typescript';

const modules = new Map();
function loadTsx(url) {
  if (modules.has(url.href)) return modules.get(url.href);
  const require = createRequire(url);
  const compiled = ts.transpileModule(readFileSync(url, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const loaded = { exports: {} };
  const localRequire = name => name.startsWith('.') ? loadTsx(new URL(`${name}.tsx`, url)) : require(name);
  new Function('require', 'exports', 'module', compiled)(localRequire, loaded.exports, loaded);
  modules.set(url.href, loaded.exports);
  return loaded.exports;
}

const { default: LessonExercise, dictationHiddenPositions, briefDictationCorrection, finalizePairResults, lessonShuffle, uniqueLessonWords } = loadTsx(new URL('../src/LessonExercise.tsx', import.meta.url));
const word = (id, text, meaning = '测试含义') => ({ id, word: text, meaning, category: '测试', example: `The ${text} is here.`, exampleZh: '中文例句', phonetic: '', tier: '基础' });

test('dictation scaffolding progresses from one or two gaps to independent input', () => {
  const branch = 'branch';
  assert(dictationHiddenPositions(branch, 0).length >= 1);
  assert(dictationHiddenPositions(branch, 0).length <= 2);
  assert.equal(dictationHiddenPositions(branch, 1).length, 3);
  assert.deepEqual(dictationHiddenPositions(branch, 2), [1, 2, 3, 4, 5]);
  assert.deepEqual(dictationHiddenPositions(branch, 3), [0, 1, 2, 3, 4, 5]);
  assert.equal(dictationHiddenPositions('cross-origin resource sharing', 0).length, 2);
});

test('short words still require an answer and fixed symbols are not editable gaps', () => {
  for (const level of [0, 1, 2, 3]) {
    assert.deepEqual(dictationHiddenPositions('C++', level), [0]);
    assert(dictationHiddenPositions('HTTP/2', level).every(position => position < 4));
    assert.deepEqual(dictationHiddenPositions('123', level), []);
  }
  assert.equal(dictationHiddenPositions('pull request', 3).length, 11);
});

test('dictation corrections identify the error without asking for another attempt in this task', () => {
  assert.match(briefDictationCorrection('branch', 'brnach'), /3、4.*顺序反了/);
  assert.match(briefDictationCorrection('branch', 'brnch'), /第 3.*漏了/);
  assert.match(briefDictationCorrection('commit', 'comit'), /漏了/);
  assert.doesNotMatch(briefDictationCorrection('branch', 'brnach'), /试着|再试|继续|branch/);
  assert.equal(briefDictationCorrection('pull request', ' PULL  REQUEST '), null);
});

test('dictation rejects wrong explicit symbols while accepting omitted fixed symbols', () => {
  assert.equal(briefDictationCorrection('C#', 'C'), null);
  assert.notEqual(briefDictationCorrection('C#', 'C++'), null);
  assert.notEqual(briefDictationCorrection('HTTP2', 'HTTP3'), null);
  assert.notEqual(briefDictationCorrection('node.js', 'nodejs.'), null);
  assert.equal(briefDictationCorrection('node.js', 'NODEJS'), null);
});

test('revealing unfinished pairs keeps each already completed outcome unchanged', () => {
  const words = [word(1, 'branch'), word(2, 'commit'), word(3, 'merge')];
  const completed = [{ wordId: 1, outcome: 'independent' }, { wordId: 2, outcome: 'assisted' }];
  assert.deepEqual(finalizePairResults(words, completed), [
    { wordId: 1, outcome: 'independent' },
    { wordId: 2, outcome: 'assisted' },
    { wordId: 3, outcome: 'revealed' },
  ]);
  assert.deepEqual(completed, [{ wordId: 1, outcome: 'independent' }, { wordId: 2, outcome: 'assisted' }]);
});

test('duplicate word IDs cannot create duplicate pair cards or repeated results', () => {
  const branch = word(1, 'branch');
  const commit = word(2, 'commit');
  const words = [branch, branch, commit, branch];
  assert.equal(uniqueLessonWords(words).length, 2);
  assert.deepEqual(finalizePairResults(words, [{ wordId: 1, outcome: 'independent' }]), [
    { wordId: 1, outcome: 'independent' }, { wordId: 2, outcome: 'revealed' },
  ]);
});

test('choice shuffling is stable for a task and leaves the source list unchanged', () => {
  const source = [word(1, 'branch'), word(2, 'commit'), word(3, 'merge')];
  const before = structuredClone(source);
  const result = lessonShuffle(source, 'session-1:task-1:options');
  assert.deepEqual(result, lessonShuffle(source, 'session-1:task-1:options'));
  assert.deepEqual(result.map(item => item.id).sort(), [1, 2, 3]);
  assert.deepEqual(source, before);
});

test('cloze initially includes the semantic clue without recording difficulty', () => {
  const target = { ...word(1, 'branch', '分支'), exampleZh: '为这个功能创建一个新分支。' };
  let difficulties = 0;
  const markup = renderToStaticMarkup(createElement(LessonExercise, {
    task: { id: 'cloze-clue', kind: 'cloze', words: [target], options: [target, word(2, 'repository'), word(3, 'commit')], evidence: [], sentence: 'Create a new ___ for this feature.', retry: false, difficulty: 0 },
    onReady() {}, onResult() {}, onDifficulty() { difficulties++; }, playWord() {},
  }));
  assert.match(markup, /为这个功能创建一个新分支。/);
  assert.match(markup, /lesson-sentence-gap/);
  assert.equal(difficulties, 0);
});

test('the cloze clue does not leak into listening or dictation', () => {
  const target = { ...word(1, 'branch', '分支'), exampleZh: '为这个功能创建一个新分支。' };
  for (const kind of ['listen', 'dictation']) {
    const markup = renderToStaticMarkup(createElement(LessonExercise, {
      task: { id: `audio-${kind}`, kind, words: [target], options: [target, word(2, 'commit')], evidence: [], retry: false, difficulty: 3 },
      onReady() {}, onResult() {}, onDifficulty() {}, playWord() {},
    }));
    assert.doesNotMatch(markup, /为这个功能创建一个新分支。/);
  }
});
