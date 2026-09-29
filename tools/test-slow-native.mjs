// Requires the isolated debug QA APK built without android.permission.INTERNET.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.CODEWORDS_PLAYWRIGHT || 'C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const adb=process.env.CODEWORDS_ADB || 'D:/coding项目/日程系统/.runtime/android-tools/sdk/platform-tools/adb.exe';
const serial=process.env.CODEWORDS_ANDROID_SERIAL || '127.0.0.1:16384';
const app='com.codewords.english.slowqa';
const command=(...args)=>execFileSync(adb,['-s',serial,...args],{encoding:'utf8'});
const manifest=command('shell','dumpsys','package',app);
assert.ok(!manifest.includes('android.permission.INTERNET'),'QA package must have no network permission');
const browser=await chromium.connectOverCDP('http://127.0.0.1:19229', {noDefaults:true});
const page=browser.contexts()[0].pages()[0]; page.setDefaultTimeout(20000);
const cancelOnly=process.env.CODEWORDS_NATIVE_CANCEL_ONLY === '1';
const errors=[],results=cancelOnly ? JSON.parse(readFileSync('artifacts/slow-reading/android-results.json','utf8')).results : [];
page.on('pageerror',e=>errors.push(e.message)); page.on('dialog',async d=>{errors.push(d.message());await d.dismiss();});
const pid=command('shell','pidof',app).trim();
const logs=()=>command('logcat','-d','--pid='+pid,'-v','brief','-s','CodeWordsAudio:I','*:S');
const latest=()=>{const all=logs();return all.slice(Math.max(all.lastIndexOf(': queue audio-'),all.lastIndexOf(': play audio-')));};
await page.evaluate(()=>{localStorage.setItem('codewords-section','daily');localStorage.setItem('codewords-voice','aria');}); await page.reload();
await page.evaluate(()=>{ window.__webPlays=0; const original=HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play=function(...args){window.__webPlays++;return original.apply(this,args);}; });
async function library() { await page.getByRole('button',{name:'日常英语',exact:true}).click(); await page.getByRole('navigation',{name:'学习导航'}).getByRole('button',{name:'词汇库',exact:true}).click(); }
async function row(text) { await page.locator('#daily-content').getByLabel('查找表达').fill(text);return page.locator('.daily-expression').filter({has:page.getByRole('button',{name:`慢速朗读 ${text}`,exact:true})}).first(); }
try {
  await library();
  for(const voice of cancelOnly ? [] : ['aria','guy']) {
    if(voice==='guy') { await page.getByRole('button',{name:'语音设置',exact:true}).click(); await page.getByLabel('点读声音',{exact:true}).selectOption('guy'); await page.getByRole('button',{name:'关闭语音设置',exact:true}).click(); }
    for(const [text,count,slow] of [['I am a student.',4,true],["What's your name?",3,true],['We are students.',3,true],['I am a student.',1,false],['student',1,true],['He is Ben. He is from China. He is a teacher.',11,true]]) {
      const target=await row(text),before=logs(); const button=target.getByRole('button',{name:`${slow?'慢速朗读':'朗读'} ${text}`,exact:true});
      await button.click(); await page.waitForFunction(label=>document.querySelector(`button[aria-label="${CSS.escape(label)}"]`)?.getAttribute('aria-pressed')==='true',`${slow?'慢速朗读':'朗读'} ${text}`);
      await page.waitForFunction(label=>document.querySelector(`button[aria-label="${CSS.escape(label)}"]`)?.getAttribute('aria-pressed')==='false',`${slow?'慢速朗读':'朗读'} ${text}`);
      const events=latest();
      results.push({voice,text,slow,clips:count,events});
      assert.equal((events.match(/\bplaying audio-/g)||[]).length,count,`${voice} ${text}`);
      assert.equal((events.match(/\bended audio-/g)||[]).length,1);
      assert.ok(!events.includes('error audio-'),events);
      if(count>1) {assert.equal((events.match(/\bgap audio-/g)||[]).length,count-1);assert.equal((events.match(/\bqueue audio-/g)||[]).length,1);}
      assert.equal(await page.evaluate(()=>window.__webPlays),0,'speech used the real native bridge');
    }
  }
  const target=await row('I am a student.'),button=target.getByRole('button',{name:'慢速朗读 I am a student.',exact:true});
  const before=logs(); await button.dblclick({delay:50});
  await page.waitForFunction(()=>document.querySelector('button[aria-label="慢速朗读 I am a student."]')?.getAttribute('aria-pressed')==='true');
  await page.getByRole('button',{name:'编程英语',exact:true}).click();
  await page.waitForTimeout(100);
  const after=latest(); await page.waitForTimeout(900); assert.equal(latest(),after,'native cancellation stops pending clips');
  assert.equal((after.match(/\bqueue audio-/g)||[]).length,1,'double tap stays one task');
  assert.ok(after.includes('stopped audio-'));
  results.push({scenario:'double tap and section cancellation',events:after});
  await library(); const next=await row('He is Ben. He is from China. He is a teacher.');
  await next.getByRole('button',{name:'慢速朗读 He is Ben. He is from China. He is a teacher.',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.daily-inline-slow.playing'));
  command('shell','input','keyevent','KEYCODE_HOME'); await new Promise(r=>setTimeout(r,200));
  const stopped=latest(); assert.ok(stopped.includes('stopped audio-')); await new Promise(r=>setTimeout(r,900)); assert.equal(latest(),stopped,'background cannot restart later words');
  command('shell','am','start','-n',`${app}/com.codewords.english.MainActivity`);
  results.push({scenario:'background cancellation',passed:true});
  assert.deepEqual(errors,[]);
} finally {
  await mkdir('artifacts/slow-reading',{recursive:true});
  await writeFile('artifacts/slow-reading/android-results.json',JSON.stringify({package:app,noInternetPermission:true,device:'MuMu Android 12 / WebView 110',results,errors},null,2));
  await writeFile('artifacts/slow-reading/android-playback.txt',logs());
  await browser.close();
}
console.log(`${results.length} real native offline scenarios passed.`);
