import assert from 'node:assert/strict';
import { test } from 'node:test';
import { androidRecognitionConstructor, downloadRecord, isAndroidApp, hasNativeAudio, startNativeAudio } from '../src/nativeAndroid.ts';

function environment(origin = 'https://appassets.androidplatform.net') {
  const sent = [], alerts = [];
  const native = { postMessage: text => sent.push(JSON.parse(text)), onmessage: null };
  globalThis.window = { location: { origin }, CodeWordsNative: native, alert: text => alerts.push(text) };
  return { sent, alerts, native, emit: (id, event, values = {}) => native.onmessage?.({ data: JSON.stringify({ id, event, ...values }) }) };
}

test('web origins never opt into the native bridge even with an injected lookalike', () => {
  for (const origin of ['https://example.org', 'http://appassets.androidplatform.net', 'https://appassets.androidplatform.net.evil.test']) {
    const env = environment(origin);
    assert.equal(isAndroidApp(), false);
    assert.equal(androidRecognitionConstructor(), undefined);
    assert.deepEqual(env.sent, []);
  }
});

test('native final text after stop remains available until end, with partial results kept separate', () => {
  const env = environment(); const Recognition = androidRecognitionConstructor();
  const current = new Recognition(); const events = [];
  current.onresult = event => events.push(event.results[0]);
  current.onend = () => events.push('end');
  current.start(); const id = env.sent[0].id;
  env.emit(id, 'partial', { text: 'Hel' }); current.stop();
  env.emit(id, 'result', { text: 'Hello.' }); env.emit(id, 'end');
  env.emit(id, 'result', { text: 'Late stale text' });
  assert.deepEqual(events, [{ isFinal: false, 0: { transcript: 'Hel' } }, { isFinal: true, 0: { transcript: 'Hello.' } }, 'end']);
  assert.deepEqual(env.sent.map(event => event.action), ['speech-start', 'speech-stop']);
});

test('aborted recognition and stale IDs cannot deliver a result to the next task', () => {
  const env = environment(); const Recognition = androidRecognitionConstructor();
  const current = new Recognition(); let results = 0;
  current.onresult = () => results++;
  current.start(); const oldId = env.sent.at(-1).id; current.abort(); current.start();
  const id = env.sent.at(-1).id;
  assert.notEqual(oldId, id);
  env.emit(oldId, 'result', { text: 'stale' });
  env.native.onmessage({ data: 'not JSON' });
  env.emit(id, 'result', { text: { untrusted: true } });
  assert.equal(results, 0);
  env.emit(id, 'result', { text: 'valid' }); assert.equal(results, 1); current.abort();
});

test('permission/service failure sends an error and never produces an answer', () => {
  const env = environment(); const Recognition = androidRecognitionConstructor();
  const current = new Recognition(); const errors = []; let results = 0;
  current.onresult = () => results++;
  current.onerror = event => { errors.push(event.error); current.abort(); };
  current.start(); const id = env.sent[0].id;
  env.emit(id, 'error', { code: 'not-allowed' }); env.emit(id, 'end');
  env.emit(id, 'result', { text: 'stale' });
  assert.deepEqual(errors, ['not-allowed']); assert.equal(results, 0);
});

test('record export preserves original damaged records and does not write browser progress', () => {
  const env = environment();
  const content = JSON.stringify({ savedRaw: '{broken', currentProgress: { session: { draft: { text: 'hello' } } } });
  downloadRecord('programming-english-record.json', content);
  assert.deepEqual(env.sent, [{ action: 'export', filename: 'programming-english-record.json', content }]);
});

test('an old WebView missing the native bridge reports export failure instead of a fake download', () => {
  const env = environment(); delete window.CodeWordsNative;
  downloadRecord('record.json', '{}');
  assert.equal(env.alerts.length, 1); assert.match(env.alerts[0], /尚未导出/); assert.deepEqual(env.sent, []);
});

test('audio bridge only accepts bundled recordings and leaves old APKs on HTML audio', () => {
  const env = environment();
  assert.equal(hasNativeAudio(), false);
  assert.equal(startNativeAudio('https://appassets.androidplatform.net/assets/web/audio/guy/word-1.mp3', 1, () => {}), undefined);
  window.CodeWordsAudio = env.native;
  for (const url of ['https://example.org/audio/guy/word-1.mp3', 'https://appassets.androidplatform.net/assets/web/index.html', 'https://appassets.androidplatform.net/assets/web/audio/guy/%2e%2e/index.html']) {
    assert.equal(startNativeAudio(url, 1, () => {}), undefined);
  }
  assert.deepEqual(env.sent, []);
});
test('native audio normal/slow, interruption and late replies keep request boundaries', () => {
  const env = environment(); window.CodeWordsAudio = env.native; const events = [];
  const audio = startNativeAudio('https://appassets.androidplatform.net/assets/web/audio/guy/word-1.mp3?v=repository', 1, event => events.push(event));
  const id = env.sent[0].id;
  assert.equal(env.sent[0].path, 'audio/guy/word-1.mp3');
  env.emit(id, 'playing'); audio.setRate(.72); audio.stop(); env.emit(id, 'ended');
  assert.deepEqual(events, ['playing']); assert.deepEqual(env.sent.map(message => message.action), ['play', 'rate', 'stop']);
  const next = startNativeAudio('https://appassets.androidplatform.net/assets/web/audio/daily/aria/hello.mp3', .72, event => events.push(event));
  env.emit(env.sent.at(-1).id, 'error', { code: 'decoder' }); env.emit(id, 'playing'); next.stop();
  assert.deepEqual(events, ['playing', 'error']);
});
