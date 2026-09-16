import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const capture = path.resolve('artifacts/daily-speech/synthetic-greeting.wav');
const browser = await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream',`--use-file-for-fake-audio-capture=${capture}`]});
const context = await browser.newContext({permissions:['microphone']});
const page = await context.newPage();
const output = {at:new Date().toISOString(), input:'Existing synthetic Aria Hello! / Goodbye. concatenated with silence; fake audio device only; no user profile or microphone.',browser:await browser.version()};
try {
  await page.goto('http://localhost:5186/',{waitUntil:'domcontentloaded',timeout:15000});
  output.capabilities = await page.evaluate(async () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const report = { secureContext:isSecureContext, standard:!!window.SpeechRecognition, prefixed:!!window.webkitSpeechRecognition, getUserMedia:!!navigator.mediaDevices?.getUserMedia };
    if (!SR) return report;
    const recognition = new SR();
    report.processLocally = 'processLocally' in recognition;
    report.available = typeof SR.available;
    report.install = typeof SR.install;
    if (typeof SR.available === 'function') {
      for (const locally of [true,false]) {
        report[locally?'localAvailability':'serviceAvailability'] = await Promise.race([SR.available({langs:['en-US'],processLocally:locally}).catch(error=>({name:error.name,message:error.message})),new Promise(resolve=>setTimeout(()=>resolve('probe-timeout'),8000))]);
      }
    }
    return report;
  });
  console.log(JSON.stringify({capabilities:output.capabilities}));
  output.fakeCapture = await page.evaluate(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    const recorder = new MediaRecorder(stream);
    let bytes = 0;
    recorder.ondataavailable = event => bytes += event.data.size;
    recorder.start();
    await new Promise(resolve=>setTimeout(resolve,2500));
    await new Promise(resolve=>{recorder.onstop=resolve;recorder.stop();});
    stream.getTracks().forEach(track=>track.stop());
    return {bytes, mimeType:recorder.mimeType, tracksStopped:stream.getTracks().every(track=>track.readyState==='ended')};
  });
  for (const mode of ['explicit-track-continuous']) {
    output[mode] = await page.evaluate(mode => new Promise(async resolve => {
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SR) return resolve({error:'unsupported'});
      const recognition = new SR();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      if (mode==='local') recognition.processLocally=true;
      const events=[];
      const began=performance.now();
      let done=false;
      let audioContext;
      let source;
      let destination;
      let stopTimer;
      const finish = reason => { if(done)return;done=true;clearTimeout(timer);clearTimeout(stopTimer);try{recognition.abort();}catch{}try{source?.stop();}catch{}destination?.stream.getTracks().forEach(track=>track.stop());audioContext?.close();resolve({reason,events}); };
      const timer=setTimeout(()=>finish('probe-timeout'),18000);
      for (const type of ['start','audiostart','soundstart','speechstart','speechend','soundend','audioend','nomatch','end','error','result']) {
        recognition.addEventListener(type,event=>{
          const row={type,elapsedMs:Math.round(performance.now()-began)};
          if(type==='error') Object.assign(row,{error:event.error,message:event.message});
          if(type==='result') row.results=Array.from(event.results,result=>({final:result.isFinal,alternatives:Array.from(result,entry=>({transcript:entry.transcript,confidence:entry.confidence}))}));
          events.push(row);
          if(type==='end') finish('end');
        });
      }
      try{
        audioContext = new AudioContext();
        const response = await fetch('/artifacts/daily-speech/synthetic-greeting.wav');
        const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
        source = audioContext.createBufferSource();
        source.buffer = buffer;
        destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        await audioContext.resume();
        recognition.start(destination.stream.getAudioTracks()[0]);
        source.start();
        stopTimer=setTimeout(()=>recognition.stop(),Math.ceil(buffer.duration*1000)+200);
      }catch(error){events.push({type:'exception',name:error.name,message:error.message});finish('exception');}
    }),mode);
    console.log(JSON.stringify({mode,result:output[mode]}));
  }
} catch(error) { output.failure={name:error.name,message:error.message}; }
finally { await context.close(); await browser.close(); }
await writeFile('artifacts/daily-speech/native-recognition-continuous-probe.json',JSON.stringify(output,null,2));
console.log(JSON.stringify(output,null,2));
