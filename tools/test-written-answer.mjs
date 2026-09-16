import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWrittenAnswer, writtenAnswersMatch } from '../src/writtenAnswer.ts';

const accepts = (actual, expected) => assert.equal(writtenAnswersMatch(actual, expected), true, `${JSON.stringify(actual)} should match ${JSON.stringify(expected)}`);
const rejects = (actual, expected) => assert.equal(writtenAnswersMatch(actual, expected), false, `${JSON.stringify(actual)} should differ from ${JSON.stringify(expected)}`);

test('typography: case, full width, curly apostrophes and sentence punctuation', () => {
  accepts('  Ｉ ＡＭ   ＭＩＡ！ ', 'I am Mia.');
  accepts('Hello, Mia!', 'hello mia');
  accepts('I’m Mia。', 'I am Mia.');
  accepts("'Hello!'", 'hello');
  accepts('Hello! I am Ben. I am from China.', "hello im ben im from china");
  assert.equal(normalizeWrittenAnswer('  Ｉ ’ ｍ　Ｍｉａ！'), "i'm mia");
});

test('I am contraction accepts missing apostrophe and a separated contraction suffix', () => {
  for (const actual of ["I'm Mia", 'im mia', 'I m Mia', "I 'm Mia", "I ' m Mia", 'I am Mia']) accepts(actual, 'I am Mia.');
  accepts('I am Mia.', "I'm Mia.");
  rejects('m', 'am');
  rejects('Mia m happy', 'Mia am happy');
  rejects('I amMia', 'I am Mia');
  rejects('Imia', 'I am Mia');
});

test('pronoun contractions preserve the subject and its auxiliary', () => {
  for (const actual of ["you're Ben", 'youre Ben', 'you re Ben', "you 're Ben"]) accepts(actual, 'You are Ben.');
  for (const actual of ["we're students", 'we re students']) accepts(actual, 'We are students.');
  for (const actual of ["they're teachers", 'theyre teachers', 'they re teachers']) accepts(actual, 'They are teachers.');
  rejects('I is Mia', 'I am Mia');
  rejects('You am Mia', 'You are Mia');
  rejects('We is students', 'We are students');
  rejects("They're a teacher", 'They are teachers');
});

test('s contractions are accepted for explicit current A1 predicates', () => {
  for (const actual of ["he's Ben", 'hes Ben', 'he s Ben', "he 's Ben"]) accepts(actual, 'He is Ben.');
  accepts('shes from Japan', 'She is from Japan.');
  accepts('she s a student', 'She is a student.');
  accepts("it's an apple", 'It is an apple.');
  accepts('it s a book', 'It is a book.');
  accepts('thats a bag', 'That is a bag.');
  accepts('whats your name', 'What is your name?');
  accepts("who's he", 'Who is he?');
  accepts("My name's Mia", 'My name is Mia.');
  accepts('My name s Ben', 'My name is Ben.');
  accepts('hes ben hes from china hes a teacher', 'He is Ben. He is from China. He is a teacher.');
});

test('omitted apostrophes in ordinary-looking words are accepted at the matching reference position', () => {
  for (const [actual, expected] of [
    ['were teachers', 'We are teachers'], ['were students', "We're students"],
    ['its a book', 'It is a book'], ['its an apple', "It's an apple"],
    ['well go', 'We will go'], ['ill go', 'I will go'],
    ['shell go', 'She will go'], ['hell go', 'He will go'],
    ['I cant read', 'I cannot read'], ['I wont go', 'I will not go'],
    ['My names Mia', 'My name is Mia'], ['No its not', 'No, it is not.'],
  ]) accepts(actual, expected);
  // Normalization itself must retain real words; tolerance is reference-dependent.
  assert.equal(normalizeWrittenAnswer('were its well ill hell shell cant wont names'), 'were its well ill hell shell cant wont names');
});

test('reference-aware apostrophes preserve tense, possession, names, missing words and negation', () => {
  for (const [actual, expected] of [
    ['They were teachers', 'They are teachers'], ['We were teachers', 'We are teachers'],
    ['its color', 'it is color'], ['its name is Mia', 'it is name is Mia'],
    ['its an apple', 'It is a book'], ['its apple', 'It is an apple'],
    ['were teacher', 'We are teachers'], ['were not teachers', 'We are teachers'],
    ['My names Ben', 'My name is Mia'], ['their names', 'their name is'],
    ['I feel ill', 'I feel I will'], ['I work well', 'I work we will'],
    ['I cant read', 'I can read'], ['I wont go', 'I will go'],
    ['cant', 'can'], ['I am ill', 'I will'], ['Yes were', 'Yes, we are'],
  ]) rejects(actual, expected);
  accepts('They were teachers', 'They were teachers');
  accepts('its color', 'its color');
  accepts('their names are Ben and Mia', 'their names are Ben and Mia');
});

test('ambiguous s/has expansion remains different from an unsupported interpretation', () => {
  rejects("He's read the book", 'He is read the book');
  rejects("He's read the book", 'He has read the book');
  rejects("Mia's book", 'Mia is book');
});

test('negative contractions preserve not and accept explicit expanded equivalents', () => {
  for (const actual of ["No, she isn't.", 'no she isnt', 'No, she isn t']) accepts(actual, 'No, she is not.');
  accepts("No, I'm not.", 'No, I am not.');
  accepts("No, she's not.", 'No, she is not.');
  accepts("No, it's not.", "No, it isn't.");
  accepts('im not from Japan', 'I am not from Japan');
  accepts('They arent teachers', 'They are not teachers');
  accepts('I dont know', 'I do not know');
  accepts('I cannot read', 'I can not read');
  accepts("I can't read", 'I cannot read');
  accepts("I won't go", 'I will not go');
  rejects('I am from Japan', 'I am not from Japan');
  rejects('No, she is.', 'No, she is not.');
  rejects('No, she isnt not', 'No, she is not');
});

test('positive contractions cannot replace a clause-final auxiliary', () => {
  for (const actual of ["Yes, I'm.", 'Yes im', 'Yes I m']) rejects(actual, 'Yes, I am.');
  rejects("Yes, you're", 'Yes, you are');
  rejects("Yes, we're", 'Yes, we are');
  rejects("Yes, they're", 'Yes, they are');
  rejects("Yes, he's", 'Yes, he is');
  rejects("Yes, it's", 'Yes, it is');
  rejects("Yes I'm. Mia is here.", 'Yes I am. Mia is here.');
  rejects("I'm and you are teachers", 'I am and you are teachers');
  accepts("Yes, I'm Mia.", 'Yes, I am Mia.');
  accepts("No, I'm not.", 'No, I am not.');
  // Explicit references never make the same supplied wording or its full form invalid.
  accepts("Yes, I'm.", "Yes, I'm.");
  accepts('Yes, I am.', "Yes, I'm.");
});

test('spelling meaning, sentence order, articles and number stay meaningful', () => {
  for (const [actual, expected] of [
    ['I am Ben', 'I am Mia'], ['I am form China', 'I am from China'],
    ['I am from Japan', 'I am from China'], ['He is Mia', 'She is Mia'],
    ['I am student', 'I am a student'], ['It is a apple', 'It is an apple'],
    ['They are book', 'They are books'], ['This is a pen', 'That is a pen'],
    ['Where you are from', 'Where are you from'], ['a part', 'apart'],
    ['I am from US', 'I am from the US'], ['I am a Chinese', 'I am Chinese'],
  ]) rejects(actual, expected);
});

test('numbers retain signs and decimal precision; common country dots are harmless', () => {
  for (const left of ['2.5', '-2', '2', '25']) {
    accepts(left, `${left}!`);
    for (const right of ['2.5', '-2', '2', '25']) if (left !== right) rejects(left, right);
  }
  rejects('2 5', '2.5');
  rejects('2+2', '22');
  rejects('2/5', '25');
  accepts('I am from the U.S.', 'I am from the US.');
  accepts('I am from the U. S.', 'I am from the US.');
  accepts('I am from the U.K.', 'I am from the UK.');
  accepts('I am from the U.S.A.', 'I am from the USA.');
  rejects('I am from the UK', 'I am from the US');
});

test('empty input and unrelated punctuation cannot form a correct answer', () => {
  rejects('', 'I am Mia');
  rejects('?!。', 'Hello');
  rejects('', '');
  accepts('constructor', 'Constructor.');
  rejects('constructor', 'I am Mia');
  assert.equal(normalizeWrittenAnswer('constructor'), 'constructor');
});
