import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { readingInventory } from '../scripts/reading-audio-inventory.mjs';
import { readingKey } from '../src/readingText.ts';
import { findReadingAudio } from '../src/readingAudio.ts';
import { FeedbackAudio } from '../src/feedbackAudio.ts';
import { createDailyProgress, createDailySession, beginDailyExercises, markDailyAudioHelp, markDailyHelp, updateDailyDraft, submitDailyAnswer, parseDailyProgress } from '../src/dailyProgress.ts';

test('current course vocabulary and option inventory matches the shipped recordings', () => {
  assert.deepEqual(JSON.parse(readFileSync(new URL('../src/readingAudio.json', import.meta.url))), readingInventory());
  for (const text of ['repository', 'GitHub', "I'm", 'students', 'Hello!', 'My name is Ben.', 'f']) assert.ok(findReadingAudio(text), text);
  assert.notEqual(readingKey('c++'), readingKey('c'));
  assert.notEqual(readingKey('c#'), readingKey('c'));
  assert.equal(findReadingAudio('不存在的中文'), undefined);
  assert.ok(findReadingAudio('an apple').path.endsWith('?v=an%20apple.'), 'updated phrase recordings must bypass the previous cached clip');
});

test('audio help survives refresh, leaves answers hidden, and never counts as independent listening', () => {
  const lesson = { id: 'audio-lesson', title: '听力', goal: '听力', explanation: '', phrases: [{ id: 'word', en: 'code', zh: '代码' }], exercises: [{ id: 'listen', kind: 'listen', prompt: '听音', audioId: 'word', options: ['code', 'file'], answers: ['code'], explanation: 'code 是代码。' }], rechecks: [] };
  let progress = { ...createDailyProgress(), session: beginDailyExercises(createDailySession(lesson, 'lesson')) };
  const rawBefore = JSON.stringify(progress);
  progress = markDailyAudioHelp(progress, lesson);
  assert.equal(progress.session.draft.helpSource, 'audio');
  assert.equal(progress.session.draft.choice, null);
  assert.equal(progress.session.draft.revealed, false);
  assert.equal(progress.session.feedback, null);
  assert.equal(markDailyAudioHelp(progress, lesson), progress);
  const restored = parseDailyProgress(JSON.stringify(progress), [lesson]);
  assert.equal(restored.writable, true);
  assert.equal(restored.progress.session.draft.helpSource, 'audio');
  const answered = submitDailyAnswer({ ...restored.progress, session: updateDailyDraft(restored.progress.session, { choice: 'code' }) }, lesson);
  assert.equal(answered.session.feedback.correct, true);
  assert.equal(answered.session.feedback.outcome, 'assisted');
  assert.equal(markDailyHelp(progress, lesson).session.draft.helpSource, undefined);
  assert.equal(parseDailyProgress(rawBefore, [lesson]).writable, true, 'old drafts remain valid');
});

test('feedback is once per action, ignores muted actions, and completes at normal speed', t => {
  const items = []; let stoppedSpeech = 0;
  const feedback = new FeedbackAudio(() => stoppedSpeech++, path => path, url => {
    const audio = { src: url, paused: true, currentTime: 0, plays: 0, load() {}, removeAttribute() {}, pause() { this.paused = true; this.onpause?.(); }, play() { this.plays++; this.paused = false; return Promise.resolve(); } };
    items.push(audio); return audio;
  });
  t.after(() => feedback.dispose());
  feedback.preload();
  assert.equal(items.length, 3);
  assert.equal(items.reduce((n, audio) => n + audio.plays, 0), 0, 'preload and restoration stay silent');
  assert.equal(feedback.play('correct', 'round-1:1'), true);
  assert.equal(feedback.play('correct', 'round-1:1'), false);
  assert.equal(stoppedSpeech, 1);
  assert.equal(feedback.play('complete', 'round-1'), true);
  assert.equal(items[0].paused, true);
  assert.equal(items[1].playbackRate, 1);
  feedback.stop();
  assert.equal(items[1].paused, true);
  feedback.enabled = false;
  assert.equal(feedback.play('correct', 'round-2:1'), false);
  feedback.enabled = true;
  assert.equal(feedback.play('correct', 'round-2:1'), false, 'enabling does not replay an old muted result');
  assert.equal(stoppedSpeech, 2);
});

function failingFeedback(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const items = [], busy = [];
  const feedback = new FeedbackAudio(() => {}, path => path, src => {
    const audio = { src, paused: true, currentTime: 0, plays: 0,
      load() {}, removeAttribute() {}, pause() { this.paused = true; this.onpause?.(); },
      play() { this.plays++; this.paused = false; return Promise.resolve(); } };
    items.push(audio); return audio;
  }, () => false, value => busy.push(value));
  t.after(() => feedback.dispose());
  return { feedback, items, busy };
}

test('a failed completion sound retries once and duplicate completion actions stay silent', t => {
  const { feedback, items } = failingFeedback(t);
  feedback.play('complete', 'round-1');
  items[0].onerror();
  t.mock.timers.tick(200);
  assert.equal(items.length, 2, 'recover a transient MP3 failure');
  assert.equal(items[1].src, 'audio/feedback/complete.mp3');
  assert.equal(items[1].playbackRate, 1);
  items[1].onerror();
  t.mock.timers.tick(200);
  assert.equal(items.length, 2, 'do not loop when audio remains unavailable');
  assert.equal(feedback.play('complete', 'round-1'), false);
});

test('navigation, muting and a new action cancel a pending completion retry', t => {
  const { feedback, items } = failingFeedback(t);
  feedback.play('complete', 'round-1'); items.at(-1).onerror(); feedback.stop();
  t.mock.timers.tick(200); assert.equal(items.length, 1);
  feedback.play('complete', 'round-2'); items.at(-1).onerror(); feedback.enabled = false;
  t.mock.timers.tick(200); assert.equal(items.length, 2);
  feedback.enabled = true;
  feedback.play('complete', 'round-3'); items.at(-1).onerror();
  feedback.play('correct', 'round-4:1');
  t.mock.timers.tick(200); assert.equal(items.length, 4);
  assert.equal(items.at(-1).src, 'audio/feedback/correct.mp3');
});

test('failed answer cues are not replayed as delayed answers', t => {
  const { feedback, items } = failingFeedback(t);
  feedback.play('correct', 'round-1:1'); items[0].onerror();
  t.mock.timers.tick(200); assert.equal(items.length, 1);
  assert.equal(feedback.play('correct', 'round-1:1'), false);
  feedback.play('complete', 'round-1');
  assert.equal(items.length, 2);
});

test('completion playback and its pending retry block sync until playback ends or is cancelled', t => {
  const { feedback, items, busy } = failingFeedback(t);
  feedback.play('complete', 'round-1');
  assert.equal(busy.at(-1), true);
  items[0].onerror();
  assert.equal(busy.at(-1), true, 'the retry delay still protects the cue');
  t.mock.timers.tick(200);
  assert.equal(busy.at(-1), true);
  items[1].onended();
  assert.equal(busy.at(-1), false, 'sync resumes after a real playback end');
  feedback.play('complete', 'round-2'); items.at(-1).onerror(); feedback.stop();
  assert.equal(busy.at(-1), false, 'navigation releases the pending retry');
  t.mock.timers.tick(200); assert.equal(busy.at(-1), false);
});

test('an expired cue waiting for pronunciation releases sync without late playback', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const busy = [];
  const feedback = new FeedbackAudio(() => {}, path => path, () => { throw new Error('an expired cue must stay silent'); }, () => true, value => busy.push(value));
  t.after(() => feedback.dispose());
  feedback.play('complete', 'round-1');
  assert.equal(busy.at(-1), true);
  t.mock.timers.tick(10040);
  assert.equal(busy.at(-1), false, 'a stalled pronunciation must not leave sync blocked');
});
