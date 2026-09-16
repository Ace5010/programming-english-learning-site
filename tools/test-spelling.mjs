// Run: node --test tools/test-spelling.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';

// Load the real TSX module using the project's TypeScript dependency. No browser,
// DOM shim or duplicated spelling implementation is needed for these pure helpers.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL('../src/ReviewSpelling.tsx', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
    jsx: ts.JsxEmit.ReactJSX,
  },
}).outputText;
const spellingModule = { exports: {} };
new Function('require', 'exports', 'module', compiled)(require, spellingModule.exports, spellingModule);
const { normalizeSpelling, spellingCorrection, spellingFixedCharacterError, spellingGapPositions } = spellingModule.exports;

test('capitalization and extra whitespace do not turn a correct spelling into an error', () => {
  assert.equal(spellingCorrection('branch', ' BRANCH '), null);
  assert.equal(spellingCorrection('pull request', '  PULL\t  request\n'), null);
  assert.equal(spellingCorrection('pull request', 'pullrequest'), null);
  assert.equal(normalizeSpelling('HTTP/2'), 'http');
  assert.notEqual(spellingCorrection('pull request', 'pool request'), null);
});

test('a swapped pair is located without revealing the answer', () => {
  const correction = spellingCorrection('branch', 'brnach');
  assert.match(correction, /3、4.*顺序反了/);
  assert.doesNotMatch(correction, /branch|「[a-z]」/i);
});

test('missing and additional letters receive different actionable corrections', () => {
  assert.match(spellingCorrection('branch', 'brnch'), /第 3.*漏了一个/);
  assert.match(spellingCorrection('branch', 'braanch'), /第 4.*多了一个/);
  assert.match(spellingCorrection('branch', 'bran'), /还少 2 个字母/);
  assert.match(spellingCorrection('branch', 'branchxx'), /多了 2 个字母/);
});

test('repeated letters must all be present in the correct order', () => {
  assert.equal(spellingCorrection('committee', 'COMMITTEE'), null);
  assert.match(spellingCorrection('committee', 'comittee'), /漏了一个/);
  assert.match(spellingCorrection('commit', 'comit'), /漏了一个/);
  assert.match(spellingCorrection('letter', 'lettter'), /多了一个/);
  assert.notEqual(spellingCorrection('commit', 'comimt'), null);
});

test('fixed numbers and symbols can be omitted or supplied correctly', () => {
  for (const [word, answer] of [
    ['C#', 'C'], ['C#', 'C#'], ['C++', 'C++'],
    ['HTTP2', 'http'], ['HTTP2', 'HTTP2'],
    ['node.js', 'nodejs'], ['node.js', 'NODE.js'],
    ['cross-origin', 'cross origin'],
  ]) {
    assert.equal(spellingCorrection(word, answer), null, `${word}: ${answer}`);
    assert.equal(spellingFixedCharacterError(word, answer), null, `${word}: ${answer}`);
  }
});

test('explicitly wrong symbols, numbers or symbol positions cannot pass', () => {
  for (const [word, answer] of [
    ['C#', 'C++'], ['C++', 'C#'], ['HTTP2', 'HTTP3'],
    ['node.js', 'nodejs.'], ['node.js', 'node..js'],
    ['cross-origin', 'c-rossorigin'], ['branch', 'branch#'],
    ['branch', 'branch中文'],
  ]) {
    assert.notEqual(spellingFixedCharacterError(word, answer), null, `${word}: ${answer}`);
  }
});

test('symbol tolerance never makes incorrect English letters correct', () => {
  for (const [word, answer] of [['HTTP2', 'HTP'], ['node.js', 'nodej'], ['C#', 'D']]) {
    assert.notEqual(spellingCorrection(word, answer), null, `${word}: ${answer}`);
  }
});

test('gap exercises stay bounded and target English letters even for short terms or phrases', () => {
  for (const word of ['a', 'as', 'git', 'branch', 'repository', 'cross-origin resource sharing', 'C++', 'HTTP2']) {
    const letterCount = normalizeSpelling(word).length;
    const single = spellingGapPositions(word, 'gap');
    const multiple = spellingGapPositions(word, 'gaps');
    assert.equal(single.length, 1, word);
    assert(multiple.length >= 1 && multiple.length <= 4, word);
    assert.equal(new Set(multiple).size, multiple.length, word);
    assert([...single, ...multiple].every(position => position >= 0 && position < letterCount), word);
    if (letterCount > 1) assert(multiple.length < letterCount, word);
  }
  assert.deepEqual(spellingGapPositions('123', 'gaps'), []);
});
