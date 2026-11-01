import test from 'node:test';
import assert from 'node:assert/strict';
import { pronunciationKeys } from '../src/slowPronunciations.ts';
import { revisedAudioURL } from '../src/audioRevision.ts';
import { contextualReadingQueue } from '../src/contextualReading.ts';
import { continuousSlowQueue, slowReadingQueue, slowPlaybackRate } from '../src/slowReading.ts';

test('daily live and standalone vocabulary live use their own meaning',()=>{
  assert.deepEqual(pronunciationKeys('live','https://local/audio/daily/aria/daily-word-live.mp3'),['live@verb']);
  assert.deepEqual(pronunciationKeys('live','https://local/audio/aria/word-1859.mp3'),['live@adjective']);
  assert.ok(pronunciationKeys('I live in Japan.').includes('live@verb'));
  assert.ok(pronunciationKeys('experiments on live animals').includes('live@adjective'));
});
test('verb/noun and present/past choices survive word-by-word playback',()=>{
  assert.deepEqual(pronunciationKeys('record'),['record@verb']);
  assert.deepEqual(pronunciationKeys('electronic record'),['electronic','record@noun']);
  assert.deepEqual(pronunciationKeys('a refuse dump'),['a','refuse@noun','dump']);
  assert.ok(pronunciationKeys('We refuse to talk to terrorists.').includes('refuse@verb'));
  assert.ok(pronunciationKeys('She had read about it in the newspapers.').includes('read@past'));
  assert.ok(pronunciationKeys('Read this book.').includes('read@present'));
  assert.ok(pronunciationKeys('The data can be used to make useful economic predictions.').includes('used@past'));
  assert.ok(pronunciationKeys('I am used to this job.').includes('used@habit'));
});
test('recording revisions preserve text revisions and relative deployment paths',()=>{
  const url=new URL(revisedAudioURL('https://site.test/cijian/audio/aria/example-1.mp3?v=old-text'));
  assert.equal(url.pathname,'/cijian/audio/aria/example-1.mp3');
  assert.equal(url.searchParams.get('v'),'old-text');
  assert.equal(url.searchParams.get('audio'),'clear-20261101-v1');
});
test('inline word context selects distinct real normal and slow recordings',()=>{
  const base='https://site.test/cijian/';
  for (const voice of ['aria','guy']) {
    const present=contextualReadingQueue('read','Read this book.','',voice,false,base)[0];
    const past=contextualReadingQueue('read','She had read about it in the newspapers.','',voice,false,base)[0];
    assert.notEqual(present.startMs,past.startMs);
    assert.match(past.url,/pack-v2-normal/);
    const slow=contextualReadingQueue('read','She had read about it in the newspapers.','',voice,true,base)[0];
    assert.ok(!slow.url.includes('normal-'));
    assert.equal(slowPlaybackRate,1);
    assert.equal(continuousSlowQueue('I read a book.',voice,base).length,1);
    assert.equal(slowReadingQueue('student',voice,base).length,1);
    assert.equal(slowReadingQueue('Repository. Function. Variable. Commit.',voice,base).length,4);
    assert.equal(contextualReadingQueue('cat','cat','',voice,false,base),undefined);
  }
});
