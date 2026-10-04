// Isolated real Chrome UI; ASR events below are explicitly simulated.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { adaptiveDailyLessons } from '../src/dailyPractice.ts';
import { adaptiveProgrammingLessons } from '../src/programmingPractice.ts';
import { correctDraft } from './helpers/course-answer.mjs';
import { pairOrder } from '../src/pairPractice.ts';
import { courseActivity, beginAdaptiveLearning } from '../src/adaptiveLearning.ts';
import { parseDailyProgress, createDailyProgress, createDailySession } from '../src/dailyProgress.ts';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const url = process.env.CODEWORDS_TEST_URL || 'http://localhost:5186/';
const output = process.env.CODEWORDS_ARTIFACT_DIR || 'artifacts/speaking-first/browser';
await mkdir(output,{recursive:true});
const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--no-proxy-server'] });
const report = { url, recognition:'Simulated browser events, not a real ASR service or human microphone.', sections:[], errors:[] };
try {
  for (const section of ['daily','programming']) {
    const lessons = section==='daily' ? adaptiveDailyLessons : adaptiveProgrammingLessons;
    const key = section==='daily' ? 'codewords-daily-v1' : 'codewords-programming-course-v1';
    const tasks = new Map(lessons.flatMap(lesson=>[...lesson.exercises,...lesson.rechecks,...lesson.practice].map(task=>[task.id,task])));
    const context = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
    await context.route('http://127.0.0.1:18768/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ready":false}'}));
    const page = await context.newPage();page.setDefaultTimeout(12000);
    page.on('pageerror',error=>report.errors.push(error.message));
    await page.addInitScript(({section})=>{
      if(!sessionStorage.getItem('oral-qa')) {
        localStorage.setItem('codewords-section',section);
        localStorage.setItem('codewords-theme','lagoon');
        localStorage.setItem(section==='daily'?'codewords-programming-course-v1':'codewords-daily-v1','{"version":1,"revision":0,"lessons":{},"session":null}');
        sessionStorage.setItem('oral-qa','1');
      }
      Math.random=()=>.37;
      window.__mic=[];
      class Recognition {
        start(){window.__mic.push(this);this.onaudiostart?.();}
        stop(){queueMicrotask(()=>this.onend?.());}
        abort(){this.aborted=true;}
      }
      window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
      window.__result=text=>{const current=window.__mic.at(-1);current.onresult?.({results:[{isFinal:true,0:{transcript:text}}]});if(!current.aborted)current.onend?.();};
      window.__audio=[];
      const NativeAudio=window.Audio;
      window.Audio=function(...args){const audio=new NativeAudio(...args);audio.addEventListener('playing',()=>window.__audio.push({src:audio.src,rate:audio.playbackRate}));return audio;};
      window.Audio.prototype=NativeAudio.prototype;
    },{section});
    await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
    const main=page.locator(`#${section}-content`);
    const saved=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),key);
    const otherKey=section==='daily'?'codewords-programming-course-v1':'codewords-daily-v1';
    const otherBefore=await page.evaluate(key=>localStorage.getItem(key),otherKey);
    const events=[];let manual=0,skipped=0,simulated=0, edited=0, modeSwitch=null;
    for(let round=0;round<2;round++) {
      if(round) await main.getByRole('button',{name:'返回课程',exact:true}).click();
      await main.locator('.course-current').getByRole('button',{name:'开始学习',exact:true}).click();
      await main.getByRole('button',{name:'开始练习',exact:true}).click();
      while((await saved()).session.stage==='exercise') {
        const before=await saved(), id=before.session.queue[before.session.index].exerciseId, task=tasks.get(id);
        const form=main.locator(`.daily-question[data-exercise-id="${id}"]`);
        const answer=correctDraft(task);
        if(task.kind==='speak') {
          assert.equal(task.readAloud.length,1);
          if(!events.length) {
            assert.equal(task.speechActivity,'repeat');
            assert.equal(await page.evaluate(()=>window.__mic.length),0);
            await form.getByRole('button',{name:`听示范 ${task.readAloud[0].en}`,exact:true}).click();
            await page.waitForFunction(()=>window.__audio.length>0);
            const queue=before.session.queue;
            await page.reload({waitUntil:'domcontentloaded'});
            assert.deepEqual((await saved()).session.queue,queue);
            await main.locator('.speech-mic').click();
            await page.evaluate(()=>window.__mic.at(-1).onerror?.({error:'not-allowed'}));
            await main.locator('.speech-error').waitFor();
            assert.deepEqual((await saved()).learning.targets,before.learning.targets,'permission refusal never scores or weakens a target');
            await main.locator('.speech-mic').click();
            await page.evaluate(()=>window.__mic.at(-1).onend?.());
            await main.locator('.speech-error').waitFor();
            assert.equal((await saved()).session.answers.length,0,'empty ASR has no answer evidence');
          }
          if(round===1&&!skipped) {
            await main.getByRole('button',{name:'暂时跳过这次口语',exact:true}).click();skipped++;
          } else if(round===0&&simulated>=2&&!manual) {
            await form.getByRole('button',{name:'自己表达',exact:true}).click();
            await form.locator('.speech-edit summary').click();
            await form.locator('#daily-written-answer').fill(task.sample);
            for(const checkbox of await form.locator('input[type=checkbox]').all())await checkbox.check();
            await main.locator('.daily-controls .primary').click();manual++;
          } else {
            if(task.speechActivity==='answer') {
              await form.getByRole('button',{name:'听问题',exact:true}).click();
              if(!modeSwitch) {
                await form.getByRole('button',{name:'跟读示例',exact:true}).click();
                await form.getByRole('button',{name:'自己表达',exact:true}).click();
                assert.equal((await saved()).session.draft.helped,true,'switching back cannot erase reference support');
                modeSwitch={id:task.id,round};
              }
            }
            const target=task.speechActivity==='answer'?'self':task.readAloud[0].id;
            await form.locator(`[data-speech-target="${target}"]`).click();
            await page.evaluate(text=>window.__result(text), task.speechActivity==='answer'?task.sample:task.readAloud[0].en);
            await page.waitForFunction(({key,target})=>{const s=JSON.parse(localStorage.getItem(key)).session.draft;return target==='self'?!!s.text:!!s.speech?.transcripts[target];},{key,target});
            if(task.speechActivity==='answer') for(const checkbox of await form.locator('input[type=checkbox]').all())await checkbox.check();
            if(!edited&&task.speechActivity==='repeat'&&events.length>1) {
              await form.getByText('修正识别文字',{exact:true}).click();
              await form.getByLabel('修正识别文字',{exact:true}).fill(task.readAloud[0].en+' ');edited++;
            }
            if(events.length===0) {
              const draft=(await saved()).session.draft;
              await page.reload({waitUntil:'domcontentloaded'});
              assert.deepEqual((await saved()).session.draft,draft);
              await page.getByRole('button',{name:'日常英语',exact:true}).click();
              await page.getByRole('button',{name:'编程英语',exact:true}).click();
              await page.getByRole('button',{name:section==='daily'?'日常英语':'编程英语',exact:true}).click();
              assert.deepEqual((await saved()).session.draft,draft);
            }
            await main.locator('.daily-controls .primary').click();simulated++;
          }
        } else {
          if(task.kind==='choice'||task.kind==='listen') await form.locator('.daily-option').nth(task.options.indexOf(answer.choice)).click();
          else if(task.kind==='fill') for(let index=0;index<answer.blanks.length;index++) await form.getByLabel(`第 ${index+1} 个空`,{exact:true}).fill(answer.blanks[index]);
          else if(task.kind==='write')await form.locator('textarea').fill(answer.text);
          else if(task.kind==='order')for(const index of answer.order)await form.locator('[aria-label="可选词块"] > .reading-token > .daily-token').nth(index).click();
          else if(task.kind==='match') {
            const left=pairOrder(task.pairs,`${task.id}:left`);
            for(const item of task.pairs) {
              if((await saved()).session.draft.pairs.matches[item.id])continue;
              await form.locator('.course-pair-row > .course-pair-card').nth(left.findIndex(value=>value.id===item.id)).click();
              await form.getByRole('group',{name:'中文含义',exact:true}).getByRole('button',{name:item.zh,exact:true}).click();
            }
          }
          if(task.kind!=='match')await main.locator('.daily-controls .primary').click();
        }
        await main.locator('.daily-feedback').waitFor();
        const checked=await saved();
        assert.equal(parseDailyProgress(JSON.stringify(checked),lessons).writable,true);
        const result=checked.session.answers.at(-1);
        if(task.id===modeSwitch?.id&&round===modeSwitch.round)assert.equal(result.speech.usedReference,true);
        if(task.kind==='speak')for(const id of task.knowledgeIds) {
          assert.equal(checked.learning.targets[id].confidence,before.learning.targets[id].confidence);
          assert.deepEqual(checked.learning.targets[id].abilities,before.learning.targets[id].abilities);
        }
        events.push({round:round+1,id,activity:courseActivity(task),oralMode:task.speechActivity,result:result.speech});
        if(events.length===1)await page.screenshot({path:`${output}/${section}-first-repeat.png`,fullPage:true});
        await main.locator('.daily-controls .primary').click();
      }
      await main.locator('.daily-summary').waitFor();
      await page.screenshot({path:`${output}/${section}-round-${round+1}.png`,fullPage:true});
    }
    assert.equal(await page.evaluate(key=>localStorage.getItem(key),otherKey),otherBefore);
    assert.ok(events.filter(item=>item.activity==='speaking').length>=6);
    assert.ok(events.some(item=>item.oralMode==='recall'));
    assert.ok(manual&&skipped&&simulated&&modeSwitch);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    report.sections.push({section,events,manual,skipped,edited,modeSwitch,simulatedRecognition:simulated,audio:await page.evaluate(()=>window.__audio)});
    await context.close();
  }
  // Targeted teaching fixture: only checkout is confirmed. Branch/change are
  // supported material, and must never be enrolled by reading this sentence.
  const lesson=adaptiveProgrammingLessons.find(item=>item.id==='P1-01-03');
  const task=lesson.practice.find(item=>item.speechActivity==='repeat'&&item.readAloud[0].en==='Use checkout to change branches.');
  let fixture=createDailyProgress();
  fixture.session={...createDailySession({...lesson,exercises:[task]},'lesson'),adaptive:{version:1,round:1,sourceLessonId:lesson.id,focusIds:task.knowledgeIds,newIds:task.knowledgeIds,seed:1,budget:1}};
  fixture=beginAdaptiveLearning(fixture,adaptiveProgrammingLessons);
  fixture.session.draft.speech={mode:'read',transcripts:{[task.readAloud[0].id]:task.readAloud[0].en}};
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.route('http://127.0.0.1:18768/**',route=>route.fulfill({status:200,contentType:'application/json',body:'{"ready":false}'}));
  const page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>report.errors.push(error.message));
  await page.addInitScript(fixture=>{
    localStorage.setItem('codewords-section','programming');localStorage.setItem('codewords-programming-course-v1',JSON.stringify(fixture));
    class Recognition {start(){window.__helperMic=this;this.onaudiostart?.();}stop(){queueMicrotask(()=>this.onend?.());}abort(){}}
    window.SpeechRecognition=window.webkitSpeechRecognition=Recognition;
  },fixture);
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
  const main=page.locator('#programming-content');
  await main.getByText('文字与参考句一致。',{exact:true}).waitFor();
  assert.equal(await main.getByText('这句已识别完整。',{exact:true}).count(),0,'old unknown provenance never claims an unedited ASR result');
  await main.locator('.course-support-words summary').click();
  await main.locator('.course-support-words').getByRole('button',{name:'朗读单词 change',exact:true}).click();
  await main.getByRole('button',{name:`听示范 ${task.readAloud[0].en}`,exact:true}).click();
  await main.locator('.speech-mic').click();
  await page.evaluate(text=>{const mic=window.__helperMic;mic.onresult?.({results:[{isFinal:true,0:{transcript:text}}]});mic.onend?.();},task.readAloud[0].en);
  await main.locator('.speech-target.matched').waitFor();
  await main.locator('.daily-controls .primary').click();
  await main.locator('.daily-feedback').waitFor();
  await main.locator('.daily-controls .primary').click();
  await main.locator('.daily-summary').waitFor();
  const result=await page.evaluate(()=>JSON.parse(localStorage.getItem('codewords-programming-course-v1')));
  assert.deepEqual(Object.keys(result.learning.targets),task.knowledgeIds);
  assert.deepEqual(Object.keys(result.knowledge),task.knowledgeIds);
  assert.equal(result.learning.targets[task.knowledgeIds[0]].confidence,0);
  assert.equal(result.learning.targets[task.knowledgeIds[0]].readyAt,0);
  assert.equal(result.learning.selfKnown,undefined);
  report.unintroducedHelper={sentence:task.readAloud[0].en,formalTargets:task.knowledgeIds,support:task.supportWords,result:result.session.answers[0].speech};
  await page.screenshot({path:`${output}/unintroduced-helper-complete.png`,fullPage:true});
  await context.close();
  assert.deepEqual(report.errors,[]);
} finally {await browser.close();await writeFile(`${output}/report.json`,JSON.stringify(report,null,2));}
console.log('PASS two ordinary speaking-first rounds in both sections, simulated speech, manual, skip, recovery and real audio playback');
