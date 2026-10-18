import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AudioPlayback } from '../src/audioPlayback.ts';
import { slowReadingUnits } from '../src/slowReadingText.ts';
import { pronunciationKeys } from '../src/slowPronunciations.ts';
import { startNativeQueue } from '../src/nativeAndroid.ts';

const clips = [ { url: 'first', startMs: 100, endMs: 600, pauseMs: 180 }, { url: 'second', startMs: 5000, endMs: 5400, pauseMs: 0 } ];
function setup(t, native) {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const elements = [], events = [], busy = [], errors = [];
  const player = new AudioPlayback(key => events.push(key), key => errors.push(key), undefined, url => {
    const item = { src: url, currentTime: 0, paused: true, ended: false, plays: 0,
      load() {}, removeAttribute() { this.src = ''; },
      play() { this.paused = false; this.plays++; return new Promise((resolve,reject) => { this.resolve=resolve; this.reject=reject; }); },
      pause() { this.paused = true; this.onpause?.(); },
    }; elements.push(item); return item;
  }, value => busy.push(value), native);
  t.after(() => player.dispose());
  return { player, elements, events, busy, errors };
}
test('lossless units keep contractions, inflections, currency, acronyms, filenames and 3D', () => {
  assert.deepEqual(slowReadingUnits("I'm using US files, not us. It costs £30,000 or $4.99; open main.js in 3D.").map(x=>x.text), ["I'm",'using','US','files','not','us','It','costs','£30,000','or','$4.99','open','main.js','in','3D']);
  assert.deepEqual(slowReadingUnits('student').map(x=>x.text), ['student']);
  assert.deepEqual(slowReadingUnits('/f/'), []);
  assert.throws(() => slowReadingUnits('Use @ here.'), /Unmapped/);
  assert.equal(slowReadingUnits('Hello! Next.')[0].pauseMs, 550);
  assert.deepEqual(pronunciationKeys('I live in China.'), ['I','live@verb','in','China']);
  assert.equal(pronunciationKeys('She had read about it in the newspapers.')[2], 'read@past');
});
test('one task keeps playing and sync busy through gaps, reuses one element and ends once', t => {
  const e = setup(t); e.player.playQueue(clips, .72, 'sentence');
  const audio = e.elements.at(-1); assert.equal(audio.currentTime,.1); audio.onplaying();
  audio.currentTime=.6; t.mock.timers.tick(15);
  assert.equal(e.player.isBusy,true); assert.equal(e.events.at(-1),'sentence'); assert.equal(e.busy.at(-1),true);
  t.mock.timers.tick(179); assert.equal(audio.plays,1);
  t.mock.timers.tick(1); assert.equal(audio.plays,2); assert.equal(audio.src,'second'); assert.equal(audio.currentTime,5);
  assert.equal(audio.preservesPitch,true); assert.equal(audio.playbackRate,.72);
  audio.onplaying(); audio.currentTime=5.4; t.mock.timers.tick(15);
  assert.equal(e.player.isBusy,false); assert.equal(e.busy.filter(x=>x).length,1); assert.deepEqual(e.errors,[]);
});
test('cancel in a gap and stale completion/rejection cannot resurrect or stop the next request', async t => {
  const e=setup(t); e.player.playQueue(clips,.72,'old'); const audio=e.elements.at(-1);
  audio.onplaying(); const oldEnded=audio.onended, reject=audio.reject;
  audio.currentTime=.6; t.mock.timers.tick(15); e.player.play('normal',1,'new');
  const current=e.elements.at(-1); current.onplaying(); oldEnded(); reject(new Error('stale'));
  await Promise.resolve(); t.mock.timers.tick(500);
  assert.equal(audio.plays,1); assert.equal(e.events.at(-1),'new'); assert.deepEqual(e.errors,[]);
});
test('second-segment rejection fails the whole task, never skipping or falling back', async t => {
  const e=setup(t); e.player.playQueue(clips,.72,'sentence'); const audio=e.elements.at(-1);
  audio.onplaying(); audio.currentTime=.6; t.mock.timers.tick(15); t.mock.timers.tick(180);
  audio.reject(new Error('not allowed')); await Promise.resolve();
  assert.deepEqual(e.errors,['sentence']); assert.equal(e.player.isBusy,false);
});
test('native queue gaps remain active; errors and timeouts do not replay the sentence on web', t => {
  let callback, stopped=0;
  const e=setup(t, (_clips,_rate,notify) => { callback=notify; return { stop() { stopped++; }, setRate() {} }; });
  e.player.playQueue(clips,.72,'sentence'); callback('playing'); callback('progress',undefined,100); callback('gap');
  t.mock.timers.tick(550); assert.equal(e.player.isBusy,true); assert.equal(e.events.at(-1),'sentence');
  callback('error','asset-unavailable'); assert.equal(stopped,1); assert.equal(e.elements.length,0); assert.deepEqual(e.errors,['sentence']);
});
test('native bridge sends one bounded queue and preserves gap listeners', () => {
  const sent=[], events=[]; const bridge={ postMessage(text) { sent.push(JSON.parse(text)); }, onmessage:null };
  const origin='https://appassets.androidplatform.net'; globalThis.window={location:{origin},CodeWordsAudio:bridge};
  const queue=clips.map((clip,i)=>({...clip,url:`${origin}/assets/web/audio/${i?'slow':'reading'}/aria/pack-${i}.mp3`}));
  const handle=startNativeQueue(queue,.72,event=>events.push(event));
  assert.equal(sent.length,1); assert.equal(sent[0].action,'queue'); assert.equal(sent[0].clips.length,2);
  for (const event of ['playing','gap','playing','ended','playing']) bridge.onmessage({data:JSON.stringify({id:sent[0].id,event})});
  assert.deepEqual(events,['playing','gap','playing','ended']); handle.stop();
  assert.throws(()=>startNativeQueue([{...queue[0],endMs:NaN}],.72,()=>{}));
});
