// Real local MP3s, new browser contexts; never touches the user's learning profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { slowReadingQueue } from '../src/slowReading.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = path.resolve('artifacts/slow-reading'); await mkdir(output,{recursive:true});
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});
const results=[];
async function open(voice,section='daily') {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const page=await context.newPage(); page.setDefaultTimeout(20000); const errors=[];
  page.on('pageerror',error=>errors.push(error.message)); page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
  await page.addInitScript(({voice,section})=>{
    localStorage.setItem('codewords-voice',voice); localStorage.setItem('codewords-section',section);
    const Original=window.Audio; window.__audio={items:[],events:[]};
    window.Audio=function(...args) {
      const audio=new Original(...args),id=window.__audio.items.length; window.__audio.items.push(audio);
      for(const type of ['playing','pause','ended','error']) audio.addEventListener(type,()=>window.__audio.events.push({id,type,url:audio.currentSrc || audio.src,position:audio.currentTime,rate:audio.playbackRate,pitch:audio.preservesPitch,at:performance.now(),active:window.__audio.items.filter(a=>!a.paused&&!a.ended).length}));
      return audio;
    }; window.Audio.prototype=Original.prototype; Object.setPrototypeOf(window.Audio,Original);
  },{voice,section});
  await page.goto(base);
  await page.getByRole('navigation',{name:'学习导航'}).getByRole('button',{name:'词汇库',exact:true}).click();
  return {context,page,errors};
}
async function select(e,text) {
  await e.page.locator('#daily-content').getByLabel('查找表达').fill(text);
  return e.page.locator('.daily-expression').filter({has:e.page.getByRole('button',{name:`慢速朗读 ${text}`,exact:true})}).first();
}
async function play(e,text,voice,slow=true) {
  const row=await select(e,text), button=row.getByRole('button',{name:`${slow?'慢速朗读':'朗读'} ${text}`,exact:true});
  const before=await e.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>/daily-v1|review-v1|course-v1|mastered|favorites/.test(k)))));
  const start=await e.page.evaluate(()=>window.__audio.events.length);
  if (text === 'I am a student.' && slow) await e.page.evaluate(() => {
    const context = new AudioContext(), destination = context.createMediaStreamDestination(), Original = window.Audio;
    window.__capture = {context, destination, chunks: []};
    const recorder = new MediaRecorder(destination.stream);
    recorder.ondataavailable = event => window.__capture.chunks.push(event.data);
    window.__capture.recorder = recorder;
    window.Audio = function(...args) {
      const audio = new Original(...args), source = context.createMediaElementSource(audio);
      source.connect(destination); source.connect(context.destination); return audio;
    };
    window.Audio.prototype = Original.prototype; Object.setPrototypeOf(window.Audio, Original);
    document.addEventListener('click', () => { void context.resume(); recorder.start(); }, {capture:true,once:true});
  });
  await button.click();
  await e.page.waitForFunction(start=>window.__audio.events.slice(start).some(x=>x.type==='playing'),start);
  if(slow && slowReadingQueue(text,voice,base)) {
    await e.page.waitForFunction(label=>!document.querySelector(`button[aria-label="${CSS.escape(label)}"]`)?.classList.contains('playing'),`慢速朗读 ${text}`);
  } else await e.page.waitForFunction(start=>window.__audio.events.slice(start).some(x=>x.type==='ended'),start);
  const events=await e.page.evaluate(start=>window.__audio.events.slice(start),start);
  const playing=events.filter(x=>x.type==='playing'), queue=slow?slowReadingQueue(text,voice,base):undefined;
  assert.equal(playing.length,queue?.length??1,`${voice} ${text}`);
  assert.equal(new Set(playing.map(x=>x.id)).size,1,'same task element');
  for(let i=0;i<playing.length;i++) {
    assert.equal(playing[i].rate,slow?.72:1); assert.equal(playing[i].pitch,true); assert.ok(playing[i].active<=1);
    if(queue) { assert.equal(playing[i].url,queue[i].url); assert.ok(Math.abs(playing[i].position*1000-queue[i].startMs)<180,`accurate seek ${text} ${i}`); }
  }
  const after=await e.page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k])=>/daily-v1|review-v1|course-v1|mastered|favorites/.test(k)))));
  assert.equal(after,before,'audio alone never writes learning evidence'); assert.deepEqual(e.errors,[]);
  if (text === 'I am a student.' && slow) {
    const bytes = await e.page.evaluate(async () => {
      const capture = window.__capture;
      await new Promise(resolve => { capture.recorder.onstop = resolve; capture.recorder.stop(); });
      const result = Array.from(new Uint8Array(await new Blob(capture.chunks).arrayBuffer()));
      // Keep context alive for later test playback; close only when the disposable page closes.
      return result;
    });
    await writeFile(path.join(output,`${voice}-actual-browser.webm`),Buffer.from(bytes));
  }
  results.push({voice,text,slow,events});
}
try {
  for(const voice of ['aria','guy']) {
    const e=await open(voice);
    // First playback in this fresh context must advance through all four words.
    for(const text of ['I am a student.',"What's your name?",'We are students.','He is Ben. He is from China. He is a teacher.']) await play(e,text,voice);
    await play(e,'I am a student.',voice,false); await play(e,'student',voice);
    await e.page.screenshot({path:path.join(output,`${voice}-mobile.png`)});
    const row=await select(e,'I am a student.'); const button=row.getByRole('button',{name:'慢速朗读 I am a student.',exact:true});
    let start=await e.page.evaluate(()=>window.__audio.events.length); await button.dblclick({delay:60});
    await e.page.waitForFunction(start=>window.__audio.events.slice(start).some(x=>x.type==='pause'),start);
    await e.page.getByRole('button',{name:'编程英语',exact:true}).click();
    const count=await e.page.evaluate(()=>window.__audio.events.filter(x=>x.type==='playing').length);
    await e.page.waitForTimeout(900);
    assert.equal(await e.page.evaluate(()=>window.__audio.events.filter(x=>x.type==='playing').length),count,'navigation cancels pending words');
    results.push({voice,scenario:'double-tap and navigation cancellation',passed:true});
    await e.context.close();
  }
  const e=await open('aria','programming');
  const item=e.page.locator('[data-word-id="7"]'); const slow=item.getByRole('button',{name:'慢速朗读单词 pull request',exact:true});
  const start=await e.page.evaluate(()=>window.__audio.events.length); await slow.click();
  await e.page.waitForFunction(start=>window.__audio.events.slice(start).filter(x=>x.type==='playing').length===2,start);
  await e.page.waitForFunction(()=>!document.querySelector('[data-word-id="7"] .slow-button.playing'));
  results.push({scenario:'multiword vocabulary',events:await e.page.evaluate(start=>window.__audio.events.slice(start),start)});
  assert.deepEqual(e.errors,[]); await e.context.close();
  const broken=await open('aria');
  const blocked=slowReadingQueue('I am a student.','aria',base)[1].url;
  await broken.context.route(blocked,route=>route.fulfill({status:503,body:'unavailable'}));
  const brokenRow=await select(broken,'I am a student.');
  const offset=await broken.page.evaluate(()=>window.__audio.events.length);
  await brokenRow.getByRole('button',{name:'慢速朗读 I am a student.',exact:true}).click();
  await broken.page.waitForFunction(offset=>window.__audio.events.slice(offset).some(x=>x.type==='error'),offset);
  // Preload can report its own error before the active queue reaches the failed second word.
  for (let attempt=0; attempt<100 && !broken.errors.some(x=>x.includes('读音未能播放')); attempt++) await broken.page.waitForTimeout(100);
  const failedEvents=await broken.page.evaluate(offset=>window.__audio.events.slice(offset),offset);
  assert.equal(failedEvents.filter(x=>x.type==='playing').length,1,'missing second word cannot skip to third');
  assert.equal(broken.errors.filter(x=>x.includes('读音未能播放')).length,1,'one explicit runtime error');
  results.push({scenario:'real second-word HTTP failure stops the task',events:failedEvents,errors:broken.errors});
  await broken.context.close();
} finally {
  await writeFile(path.join(output,'browser-results.json'),JSON.stringify(results,null,2)); await browser.close();
}
console.log(`${results.length} real browser scenarios passed.`);
