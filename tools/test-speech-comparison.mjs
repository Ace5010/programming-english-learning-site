// Node 22.18+ / 24: node --test tools/test-speech-comparison.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSpeech } from '../src/speechComparison.ts';

const statuses = comparison => comparison.targetWords.map(word => word.status);

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
