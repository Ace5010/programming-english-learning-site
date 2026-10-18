import assert from 'node:assert/strict';
import test from 'node:test';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { createDailySession } from '../src/dailyProgress.ts';
import { resolveAdaptiveLesson } from '../src/adaptiveLearning.ts';
import { foundationTopics } from '../src/foundationCourse.ts';
import { findReadingAudio } from '../src/readingAudio.ts';
import { sentenceGuide } from '../src/sentenceGuide.ts';
import { studyGroups, studyTitle } from '../src/courseStudy.ts';

const curricula = [adaptiveProgrammingLessons, adaptiveDailyLessons];
test('every current sentence has an exact, complete explanation and existing full audio', () => {
  const phrases = [...new Map(curricula.flat(2).flatMap(item => item.phrases).map(item => [item.id, item])).values()];
  for (const phrase of phrases.filter(item => !/^(word-|daily-word-)/.test(item.id))) {
    const guide = sentenceGuide(phrase);
    assert.ok(guide, `${phrase.id}: missing guide`);
    assert.equal(guide.parts.map(part => part.text).join(' '), phrase.en, `${phrase.id}: guide omitted or changed words`);
    assert.ok(guide.parts.every(part => part.meaning.trim()));
    assert.ok(foundationTopics.some(topic => topic.id === `foundation-${guide.topic}` && !topic.hidden));
    assert.ok(guide.link && guide.tip && findReadingAudio(phrase.en));
  }
});
test('single-target adaptive scopes preserve all phrases and pair each word with its own example', () => {
  for (const lessons of curricula) for (const source of lessons) for (const id of source.learningTargets) {
    const session = { ...createDailySession(source, 'lesson'), adaptive: { version: 1, round: 2, focusIds: [id], newIds: [id], sourceLessonId: source.id, seed: 12, budget: 8 } };
    const lesson = resolveAdaptiveLesson(session, lessons), before = JSON.stringify({ lesson, session });
    const groups = studyGroups(lesson.phrases);
    assert.deepEqual(groups.flatMap(group => [group.word, group.example, group.expression].filter(Boolean).map(item => item.id)).sort(), lesson.phrases.map(item => item.id).sort());
    for (const group of groups) {
      if (group.word?.id.startsWith('word-')) assert.equal(group.example.id, group.word.id.replace('word-', 'example-'));
    }
    const example = groups.find(group => group.example)?.example ?? groups.find(group => group.expression)?.expression;
    assert.ok(example && sentenceGuide(example), `${id}: no visible sentence to explain`);
    assert.match(studyTitle(lesson, session, lessons), /^第 2 节 · .+/);
    assert.equal(JSON.stringify({ lesson, session }), before, 'presentation changed the learning scope');
  }
});
test('instructions, questions, negation and greetings get different relevant explanations', () => {
  const guide = en => sentenceGuide({ id: 'check', en, zh: '' });
  assert.equal(guide('Open this repository.').topic, 'commands');
  assert.deepEqual(guide('Open this repository.').parts.map(part => part.text), ['Open', 'this repository.']);
  assert.equal(guide('Are you from Japan?').topic, 'be-question');
  assert.equal(guide('I am not from Japan.').topic, 'be-negative');
  assert.equal(guide('Hello!').parts.length, 1);
  assert.match(guide('Hello!').parts[0].meaning, /见面/);
  assert.equal(guide('They are books.').parts[0].meaning, '它们：句子在说谁或什么');
  assert.equal(guide('A completely new unsupported sentence.'), undefined);
});
