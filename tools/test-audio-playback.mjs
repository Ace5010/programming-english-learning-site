import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioPlayback } from '../src/audioPlayback.ts';

function setup(t, native) {
  const elements = [], events = []; let errors = 0;
  const player = new AudioPlayback(key => events.push(key), () => errors++, native, url => {
    const item = { src: url, paused: true, currentTime: 0, plays: 0, loads: 0,
      play() { this.plays++; this.paused = false; return new Promise((resolve, reject) => { this.resolve = resolve; this.reject = reject; }); },
      pause() { this.paused = true; this.onpause?.(); },
      load() { this.loads++; }, removeAttribute() { this.src = ''; },
    };
    elements.push(item); return item;
  });
  t.after(() => player.dispose());
  return { player, elements, events, errors: () => errors };
}
test('repeated taps during slow loading and playback do not cancel or restart a word', t => {
  const { player, elements, events } = setup(t);
  player.preload(['repository']); player.play('repository', 1, 'word');
  for (let i = 0; i < 6; i++) player.play('repository', 1, 'word');
  const audio = elements[0]; assert.equal(elements.length, 1); assert.equal(audio.plays, 1); assert.equal(audio.paused, false);
  audio.onplaying(); player.play('repository', 1, 'word');
  assert.equal(events.at(-1), 'word'); assert.equal(audio.paused, false);
  audio.onended(); player.play('repository', 1, 'word'); assert.equal(audio.plays, 2);
});
test('normal/slow restarts the same recording with pitch preserved and retains its cache', t => {
  const { player, elements } = setup(t);
  player.play('project', 1, 'normal'); elements[0].currentTime = .3;
  player.play('project', .72, 'slow');
  assert.equal(elements.length, 1); assert.equal(elements[0].plays, 2); assert.equal(elements[0].currentTime, 0);
  assert.equal(elements[0].playbackRate, .72); assert.equal(elements[0].preservesPitch, true);
});
test('explicit lesson button restarts an auto-played clip even after a live rate change', t => {
  const { player, elements } = setup(t);
  player.play('word', 1, 'lesson-auto'); player.setRate(.72, 'slow');
  player.play('word', .72, 'lesson-slow-button');
  assert.equal(elements[0].plays, 2); assert.equal(elements[0].playbackRate, .72);
});
test('old play rejection, ended and playing callbacks cannot stop a later word', async t => {
  const env = setup(t); env.player.play('old', 1, 'old');
  const old = env.elements[0], ended = old.onended, playing = old.onplaying;
  env.player.play('new', 1, 'new'); env.elements[1].onplaying();
  old.reject(new Error('aborted')); ended(); playing(); await Promise.resolve();
  assert.equal(env.events.at(-1), 'new'); assert.equal(env.errors(), 0); assert.equal(env.elements[1].paused, false);
});
test('failure releases the failed clip and the next tap can retry', t => {
  const env = setup(t); env.player.play('code', 1, 'code'); env.elements[0].onerror();
  assert.equal(env.errors(), 1); env.player.play('code', 1, 'code');
  assert.equal(env.elements.length, 2); assert.equal(env.elements[1].paused, false);
});
test('external pause, page navigation and disposal allow a fresh tap without ghost playback', t => {
  const env = setup(t); env.player.play('readme', 1, 'readme'); env.elements[0].pause();
  env.player.play('readme', 1, 'readme'); assert.equal(env.elements[0].plays, 2);
  const delayed = env.elements[0].onplaying; env.player.stop(); delayed(); assert.equal(env.events.at(-1), '');
});
test('native path handles rate, completion and stale callbacks without constructing HTML audio', t => {
  const calls = []; let callback;
  const env = setup(t, (url, rate, notify) => { callback = notify; calls.push([url, rate]); return { stop: () => calls.push('stop'), setRate: rate => calls.push(rate) }; });
  env.player.play('local', 1, 'daily-code-normal'); callback('playing');
  env.player.setRate(.72, 'slow'); assert.equal(env.events.at(-1), 'daily-code-slow');
  assert.equal(env.elements.length, 0); assert.equal(calls.at(-1), .72);
  callback('ended'); callback('playing'); assert.equal(env.events.at(-1), '');
});
test('native decoder error falls back once to the same local file', t => {
  let callback; let stopped = 0;
  const env = setup(t, (_url, _rate, notify) => { callback = notify; return { stop: () => stopped++, setRate() {} }; });
  env.player.play('local', .72, 'word'); callback('error', 'decoder');
  assert.equal(stopped, 1); assert.equal(env.elements[0].src, 'local'); assert.equal(env.elements[0].playbackRate, .72);
  env.elements[0].onplaying(); assert.equal(env.events.at(-1), 'word');
});
test('audio focus denial is not bypassed using a second player', t => {
  let callback;
  const env = setup(t, (_url, _rate, notify) => { callback = notify; return { stop() {}, setRate() {} }; });
  env.player.play('local', 1, 'word'); callback('error', 'focus-denied');
  assert.equal(env.elements.length, 0); assert.equal(env.errors(), 1);
});
test('a stalled browser request times out and can be retried', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const env = setup(t); env.player.play('stalled', 1, 'word'); t.mock.timers.tick(10001);
  assert.equal(env.errors(), 1); assert.equal(env.elements[0].paused, true);
  env.player.play('stalled', 1, 'word'); assert.equal(env.elements.length, 2);
});
test('bounded warmup evicts inactive clips without interrupting the playing clip', t => {
  const env = setup(t); env.player.play('current', 1, 'word');
  for (let group = 0; group < 4; group++) env.player.preload(Array.from({ length: 16 }, (_, index) => `${group}-${index}`));
  assert.equal(env.elements.filter(audio => audio.src).length, 32); assert.equal(env.elements[0].paused, false);
});

test('a native start acknowledgement without advancing playback cannot lock a word forever', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let callback, stopped = 0;
  const env = setup(t, (_url, _rate, notify) => { callback = notify; return { stop: () => stopped++, setRate() {} }; });
  env.player.play('code', 1, 'code-normal'); callback('playing');
  t.mock.timers.tick(2600);
  assert.equal(stopped, 1);
  assert.equal(env.elements.length, 1, 'stuck native playback should fall back to the local recording');
  env.elements[0].onplaying(); callback('ended');
  assert.equal(env.events.at(-1), 'code-normal', 'a late native reply cannot cancel the fallback');
});

test('a deliberate second tap retries the same word without requiring another word or speed', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let callback, starts = 0;
  const env = setup(t, (_url, _rate, notify) => { callback = notify; starts++; return { stop() {}, setRate() {} }; });
  env.player.play('repository', 1, 'normal'); callback('playing');
  t.mock.timers.tick(100); env.player.play('repository', 1, 'normal'); assert.equal(starts, 1);
  t.mock.timers.tick(1000); env.player.play('repository', 1, 'normal'); assert.equal(starts, 2);
});

test('browser playing without a moving timeline also releases the request', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const env = setup(t); env.player.play('code', 1, 'normal'); env.elements[0].onplaying();
  t.mock.timers.tick(2600);
  assert.equal(env.errors(), 1); assert.equal(env.elements[0].paused, true);
  env.player.play('code', 1, 'normal'); assert.equal(env.elements.length, 2);
});

test('a first-call native bridge exception falls back in the click and never locks the first word', t => {
  const env = setup(t, () => { throw new Error('bridge unavailable'); });
  env.player.play('repository', 1, 'normal');
  assert.equal(env.elements.length, 1); assert.equal(env.elements[0].plays, 1);
  env.elements[0].onplaying(); env.elements[0].onended();
  env.player.play('repository', 1, 'normal'); assert.equal(env.elements[0].plays, 2);
});

test('only advancing native positions keep a long clip alive; repeated positions time out', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] }); let callback;
  const env = setup(t, (_url, _rate, notify) => { callback = notify; return { stop() {}, setRate() {} }; });
  env.player.play('example', .72, 'slow'); callback('playing', undefined, 100);
  for (let position = 1000; position <= 8000; position += 1000) {
    t.mock.timers.tick(1000); callback('progress', undefined, position);
  }
  assert.equal(env.elements.length, 0);
  t.mock.timers.tick(1000); callback('progress', undefined, 8000);
  t.mock.timers.tick(1600); assert.equal(env.elements.length, 1);
});

test('loading and native fallback remain busy until completion, so sync cannot interrupt a first tap', t => {
  const events = []; let callback;
  const audio = { load() {}, pause() {}, removeAttribute() {}, play: () => Promise.resolve() };
  const player = new AudioPlayback(() => {}, () => {}, (_url, _rate, notify) => {
    callback = notify; return { stop() {}, setRate() {} };
  }, () => audio, busy => events.push(busy));
  t.after(() => player.dispose());
  player.play('code', 1, 'normal'); assert.equal(events.at(-1), true);
  const count = events.length;
  callback('error', 'playback-stalled'); audio.onplaying();
  assert.deepEqual(events.slice(count), []);
  audio.onended(); assert.equal(events.at(-1), false);
});

test('a synchronous browser setup exception releases both audio and the sync blocker', t => {
  const states = []; let errors = 0;
  const player = new AudioPlayback(() => {}, () => errors++, undefined,
    () => { throw new Error('media setup unavailable'); }, busy => states.push(busy));
  t.after(() => player.dispose());
  player.play('code', 1, 'normal'); player.play('code', 1, 'normal');
  assert.equal(errors, 2); assert.equal(states.at(-1), false);
});
