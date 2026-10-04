// Node 22.18+ / 24: node --test tools/test-speech-comparison.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { assessSpeech, compareSpeech } from '../src/speechComparison.ts';

const statuses = comparison => comparison.targetWords.map(word => word.status);

test('course speech accepts one sentence discrepancy and preserves literal differences', () => {
  for (const heard of ['please check my green request', 'please check my request', 'please check my pull request now']) {
    const result = assessSpeech('Please check my pull request.', heard);
    assert.equal(result.accepted, true, heard);
    assert.equal(result.assessment, 'tolerated');
    assert.equal(result.comparison.allMatched, false);
  }
  for (const heard of ['please change my blue request', 'please check request', 'please check my pull request right now', 'request pull my check please', '', '...']) {
    assert.equal(assessSpeech('Please check my pull request.', heard).accepted, false, heard);
  }
  assert.equal(assessSpeech('Hello', 'yellow').accepted, false);
  assert.equal(assessSpeech('My name', 'my').accepted, false);
  assert.equal(assessSpeech('Hello', 'hello').assessment, 'exact');
});

test('near-sound words use ordered sentence context and keep the literal transcript differences', () => {
  for (const heard of ['please check my poll request', 'please check my pool request', 'please check my Paul request', 'please check my pole request']) {
    const result = assessSpeech('Please check my pull request.', heard);
    assert.equal(result.assessment, 'context');
    assert.deepEqual(result.comparison.targetWords[3].heard, [heard.split(' ')[3]]);
    assert.equal(result.comparison.targetWords[3].status, 'different');
  }
  assert.equal(assessSpeech('pull request', 'poll request').accepted, true);
  assert.equal(assessSpeech('pull request', 'poll question').accepted, false);
  assert.equal(assessSpeech('Please check my pull request.', 'please change my poll request').accepted, false);
  assert.equal(assessSpeech('pull', 'poll').accepted, false);
  assert.equal(assessSpeech('pull files', 'poll files').assessment, 'context');
});

test('a technical phrase provides a larger context window for several near-sound differences', () => {
  const expected = 'Please check my pull request.';
  for (const heard of ['please check my pool requests', 'police check my pole requests', 'please cheque my poll requests', 'please chick my pool requests']) {
    const result = assessSpeech(expected, heard);
    assert.equal(result.assessment, 'context', heard);
    assert.ok(result.differences >= 2);
    assert.equal(result.comparison.allMatched, false);
    assert.deepEqual(result.comparison, compareSpeech(expected, heard));
  }
  for (const heard of ['pool requests', 'Paul request', 'pollrequest']) {
    assert.equal(assessSpeech('pull request', heard).assessment, 'context', heard);
  }
  for (const heard of ['police cheque mine pool requests', 'please change my pool requests', 'please check my poll question', 'please check my poll request tomorrow now', 'please check my', 'please check my request']) {
    const result = assessSpeech(expected, heard);
    assert.notEqual(result.assessment, 'context', heard);
  }
});

test('context matches ASR word boundaries without inventing omitted speech or losing raw offsets', () => {
  for (const heard of ['please check my pull re quest', 'please check my pool re quest', 'please check my poolrequest', 'please check my pullrequest']) {
    const result = assessSpeech('Please check my pull request.', heard);
    assert.equal(result.assessment, 'context', heard);
    for (const word of result.comparison.targetWords) assert.equal('Please check my pull request.'.slice(word.start, word.end), word.text);
  }
  assert.equal(assessSpeech('Read the README for help.', 'reed the read me for help').assessment, 'context');
  assert.equal(assessSpeech('Use checkout to change branches.', 'use check out to change branches').assessment, 'context');
  assert.equal(assessSpeech('Please check my pull request.', 'please check my pool').accepted, false);
  assert.equal(assessSpeech('Please check my pull request.', 'please check request').accepted, false);
  assert.equal(assessSpeech('Please check my pull request.', 'please check my poll re').accepted, false);
});

test('sentence context tolerates several similar words beyond pull request, without arbitrary wrong words', () => {
  for (const [expected, heard] of [
    ['Read the code for me.', 'reed the coat for me'],
    ['Create a new branch.', 'create a knew brunch'],
    ['The file is here.', 'the phile is hear'],
    ['The new code is here for me today.', 'the knew coat is hear four me today'],
  ]) assert.equal(assessSpeech(expected, heard).assessment, 'context', `${expected} / ${heard}`);
  for (const [expected, heard] of [
    ['Read the code for me.', 'delete the data for me'],
    ['Read the code for me.', 'reed coat'],
    ['Create a new branch.', 'destroy a old brunch'],
    ['Read the code and check my coat.', 'read the coat and check my code'],
    ['The code is not here.', 'the coat is now hear'],
    ['The new code is here for me.', 'the knew coat is hear four me'],
    ['Hello', 'hallo'], ['My name', 'my'], ['My name', 'mine fame'],
    ['Hello Ben.', '你好 本'],
  ]) assert.equal(assessSpeech(expected, heard).accepted, false, `${expected} / ${heard}`);
});

test('matches case, surrounding punctuation, curly apostrophes and full-width letters', () => {
  for (const [expected, heard] of [
    ['Hello, Ben!', 'hello ben.'], ["I'm Mia.", 'I’M MIA!'], ['Ｈｅｌｌｏ！', 'hello'],
    ["'Hello!'", 'Hello'], ['Good-bye.', 'good bye'],
  ]) assert.equal(compareSpeech(expected, heard).allMatched, true, `${expected} / ${heard}`);
});

test('returns original target tokens and offsets for punctuation-preserving highlighting', () => {
  const target = ' “Hello!” I’m Mia.';
  const result = compareSpeech(target, 'hello i am mia');
  assert.deepEqual(result.targetWords.map(word => word.text), ['Hello', 'I’m', 'Mia']);
  for (const word of result.targetWords) assert.equal(target.slice(word.start, word.end), word.text);
  assert.equal(result.matchedCount, 3);
  assert.equal(result.totalCount, 3);
  assert.deepEqual(result.targetWords[1].heard, ['i', 'am']);
});

test('accepts goodbye speech spelling variants without accepting misheard or incomplete farewells', () => {
  for (const heard of ['goodbye', 'good bye', 'good-bye', 'Good Bye!']) {
    const result = compareSpeech('Goodbye!', heard);
    assert.equal(result.allMatched, true, heard);
    assert.equal(result.totalCount, 1);
    assert.deepEqual(result.targetWords.map(word => [word.text, word.start, word.end, word.status]), [['Goodbye', 0, 7, 'matched']]);
    assert.deepEqual(result.extras, []);
    assert.equal(compareSpeech(heard, 'Goodbye!').allMatched, true);
  }
  assert.equal(compareSpeech('Hello, Goodbye!', 'hello good bye').allMatched, true);
  for (const heard of ['good', 'bye', 'with by', 'good by', 'good boy', 'good good bye']) {
    assert.equal(compareSpeech('Goodbye!', heard).allMatched, false, heard);
  }
  assert.deepEqual(compareSpeech('Goodbye!', 'bye').targetWords[0].missingParts, ['good']);
});

test('a missing word does not make following words incorrect', () => {
  const result = compareSpeech('I am from China.', 'I from China');
  assert.deepEqual(statuses(result), ['matched', 'missing', 'matched', 'matched']);
  assert.deepEqual(result.targetWords[1].missingParts, ['am']);
  assert.equal(result.allMatched, false);
  assert.deepEqual(result.extras, []);
});

test('reports a replacement beside its target and retains later exact matches', () => {
  const result = compareSpeech('This is my book.', 'This is your book');
  assert.deepEqual(statuses(result), ['matched', 'matched', 'different', 'matched']);
  assert.deepEqual(result.targetWords[2].heard, ['your']);
  assert.equal(result.allMatched, false);
});

test('extra words are not ignored even when every target word matches', () => {
  const result = compareSpeech('I am Ben.', 'Hello I am not Ben today');
  assert.deepEqual(statuses(result), ['matched', 'matched', 'matched']);
  assert.deepEqual(result.extras.map(word => [word.text, word.status, word.beforeTargetIndex]), [
    ['Hello', 'extra', 0], ['not', 'extra', 2], ['today', 'extra', 3],
  ]);
  assert.equal(result.allMatched, false);
});

test('repeated words consume separate positions rather than using set membership', () => {
  let result = compareSpeech('Very very good.', 'very good');
  assert.equal(result.targetWords.filter(word => word.status === 'missing').length, 1);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.targetWords[2].status, 'matched');
  assert.equal(result.allMatched, false);
  result = compareSpeech('very good', 'very very good');
  assert.equal(result.extras.length, 1);
  assert.equal(result.extras[0].text, 'very');
  assert.equal(result.allMatched, false);
  assert.equal(compareSpeech('I said I am here.', 'I said I am here').allMatched, true);
});

test('word order matters, and equal-cost alignment preserves exact words', () => {
  const result = compareSpeech('I like tea.', 'I tea like');
  assert.equal(result.allMatched, false);
  assert.equal(result.matchedCount, 2);
  assert.equal(result.extras.length, 1);
  assert.equal(result.targetWords.filter(word => word.status === 'missing').length, 1);
});

test('normalizes common A1 contractions in either direction', () => {
  for (const [short, full] of [
    ["I'm Ben.", 'I am Ben.'], ["What's your name?", 'What is your name?'],
    ["My name's Mia.", 'My name is Mia.'], ["You're here.", 'You are here.'],
    ["We're friends.", 'We are friends.'], ["They're at home.", 'They are at home.'],
    ["She's my friend.", 'She is my friend.'], ["It isn't a book.", 'It is not a book.'],
    ["I can't go.", 'I cannot go.'], ["I don't know.", 'I do not know.'],
    ["I'll go.", 'I will go.'], ["I've got a book.", 'I have got a book.'],
  ]) {
    assert.equal(compareSpeech(short, full).allMatched, true, `${short} / ${full}`);
    assert.equal(compareSpeech(full, short).allMatched, true, `${full} / ${short}`);
  }
});

test('partial contraction recognition stays incomplete, including a partially extra word', () => {
  const missing = compareSpeech("I'm Ben.", 'I Ben');
  assert.equal(missing.targetWords[0].status, 'missing');
  assert.deepEqual(missing.targetWords[0].missingParts, ['am']);
  assert.deepEqual(missing.targetWords[0].heard, ['I']);
  assert.equal(missing.allMatched, false);
  const different = compareSpeech("I'm Ben.", 'I is Ben');
  assert.equal(different.targetWords[0].status, 'different');
  assert.deepEqual(different.targetWords[0].heard, ['I', 'is']);
  const extra = compareSpeech('I', "I'm");
  assert.equal(extra.allMatched, false);
  assert.deepEqual(extra.extras, [{ text: 'am', sourceText: "I'm", status: 'extra', beforeTargetIndex: 1 }]);
});

test('does not turn possessives or ambiguous apostrophe-free words into contractions', () => {
  for (const [expected, heard] of [
    ["John's book", 'John is book'], ["I'm Ben", 'Im Ben'], ["We'll go", 'well go'],
    ["I'd go", 'I would go'], ["He's here", 'He has here'], ["I'm Ben", 'I not Ben'],
  ]) assert.equal(compareSpeech(expected, heard).allMatched, false, `${expected} / ${heard}`);
});

test('normalizes elementary integer numerals, including hyphenated tens', () => {
  for (const [expected, heard] of [
    ['I have 2 pens.', 'I have two pens'], ['I am 21.', 'I am twenty-one'],
    ['There are 99 books.', 'There are ninety nine books'], ['100', 'one hundred'],
    ['0', 'zero'], ['１７', 'seventeen'], ['twenty two', '22'],
  ]) assert.equal(compareSpeech(expected, heard).allMatched, true, `${expected} / ${heard}`);
  assert.equal(compareSpeech('I have 2 pens', 'I have three pens').allMatched, false);
  assert.equal(compareSpeech('21', 'twenty').allMatched, false);
});

test('does not invent equivalences for decimals, leading zeros, homophones or joined words', () => {
  for (const [expected, heard] of [
    ['2.5', '25'], ['2.5', 'two five'], ['01', 'one'], ['1,000', 'one zero'],
    ['to', 'two'], ['four', 'for'], ['a part', 'apart'], ['I am', 'Iam'],
    ['ice cream', 'icecream'], ['2a', 'two a'], ['1st', 'first'],
  ]) assert.equal(compareSpeech(expected, heard).allMatched, false, `${expected} / ${heard}`);
});

test('blank or punctuation-only speech never succeeds', () => {
  for (const transcript of ['', '   ', '...!?', '🎤']) {
    const result = compareSpeech('Hello.', transcript);
    assert.equal(result.allMatched, false);
    assert.deepEqual(statuses(result), ['missing']);
  }
  assert.equal(compareSpeech('', '').allMatched, false);
  assert.equal(compareSpeech('!?', '!?').allMatched, false);
  assert.equal(compareSpeech('', 'Hello').allMatched, false);
});

test('comparison is deterministic and keeps transcript names and non-English words literal', () => {
  const args = ['Hello, Ben. My name is Mia.', 'Hello Sam my name Mia'];
  assert.deepEqual(compareSpeech(...args), compareSpeech(...args));
  assert.equal(compareSpeech('Ben', 'Mia').allMatched, false);
  assert.equal(compareSpeech('Hello', '你好').allMatched, false);
  assert.equal(compareSpeech('café', 'cafe').allMatched, false);
});

test('ordinary words that are Object prototype names remain literal', () => {
  assert.equal(compareSpeech('constructor', 'constructor').allMatched, true);
  assert.equal(compareSpeech('constructor', 'to string').allMatched, false);
});
