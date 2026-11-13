// Real production reading components and MP3 playback in disposable browser profiles.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {contextualReadingQueue} from '../src/contextualReading.ts';
import {observeAudioSources} from './helpers/audio-source-observer.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output=process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/audio-optimization-20261031/context-browser';await mkdir(output,{recursive:true});
const cases=[['live','I live in China.'],['live','experiments on live animals'],['read','She had read about it in the newspapers.'],['refuse','We refuse to talk to terrorists.'],['close','her close friendship with her aunt']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-proxy-server']});const results=[];
try {
  for(const voice of ['aria','guy']) {
    const context=await browser.newContext();const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(observeAudioSources);
    await page.goto(base);await page.getByRole('navigation',{name:'学习导航'}).waitFor();
    await page.evaluate(async({voice,cases})=>{
      const {mount}=await import('/tools/helpers/contextual-audio-harness.mjs');mount(voice,cases);
    },{voice,cases});
    for(let index=0;index<cases.length;index++)for(const slow of [false,true]) {
      const [word,text]=cases[index],expected=contextualReadingQueue(word,text,'',voice,slow,base)[0];
      const start=await page.evaluate(()=>window.__contextEvents.length);
      const section=page.locator(`#context-test [data-case="${index}"]`);
      if(!slow)await section.getByRole('button',{name:`朗读单词 ${word}`,exact:true}).click();
      else await page.getByRole('group',{name:`${word} 发音`,exact:true}).getByRole('button',{name:`慢速朗读单词 ${word}`,exact:true}).click();
      await page.waitForFunction(start=>window.__contextEvents.length>start,start);
      await page.waitForFunction(()=>!window.__contextPlayer.isBusy);
      const events=await page.evaluate(start=>window.__contextEvents.slice(start),start);assert.equal(events.length,1);
      assert.equal(events[0].url,expected.url);assert.equal(events[0].rate,1);assert.equal(events[0].pitch,true);
      assert.ok(Math.abs(events[0].position*1000-expected.startMs)<180);
      results.push({voice,text,word,slow,...events[0]});
    }
    assert.deepEqual(errors,[]);await page.evaluate(()=>window.__contextPlayer.dispose());await context.close();
  }
} finally {await writeFile(`${output}/results.json`,JSON.stringify(results,null,2));await browser.close();}
console.log(`${results.length} contextual normal/slow real MP3 scenarios passed.`);
