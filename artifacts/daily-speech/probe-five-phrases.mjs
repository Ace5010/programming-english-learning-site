import { createRequire } from 'node:module';
import { writeFile } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/shenwuqiang/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const phrases=[['hello','Hello!'],['goodbye','Goodbye!'],['i-am-ben','I am Ben.'],['this-is-a-book','This is a book.'],['meet-ben','Hi! My name is Ben. Are you Mia?']];
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--autoplay-policy=no-user-gesture-required']});
const output={at:new Date().toISOString(),browser:await browser.version(),input:'Existing synthetic Aria course MP3 decoded by Web Audio and passed to native SpeechRecognition.start(audioTrack). No physical microphone, user profile, result mocking or language pack installation.',results:[]};
try{
  for(const [id,source] of phrases){
    const context=await browser.newContext();
    const page=await context.newPage();
    await page.route('**/__native_speech_probe__',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Isolated synthetic speech probe</title>'}));
    await page.goto('http://localhost:5186/__native_speech_probe__',{timeout:5000});
    let outerTimer;
    const result=await Promise.race([page.evaluate(async ({id,source})=>{
      const report={id,source,events:[],transcript:'',error:null};
      const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
      if(!SR)return {...report,error:'unsupported'};
      return new Promise(resolve=>{
        const recognition=new SR();
        recognition.lang='en-US';recognition.continuous=true;recognition.interimResults=true;
        let audioContext,bufferSource,destination,stopTimer,done=false;
        const startTime=performance.now();
        const finish=reason=>{
          if(done)return;done=true;clearTimeout(timeout);clearTimeout(stopTimer);
          try{recognition.abort();}catch{}try{bufferSource?.stop();}catch{}
          destination?.stream.getTracks().forEach(track=>track.stop());audioContext?.close();
          resolve({...report,reason,elapsedMs:Math.round(performance.now()-startTime)});
        };
        const timeout=setTimeout(()=>finish('probe-timeout'),11000);
        for(const type of ['start','audiostart','soundstart','speechstart','speechend','soundend','audioend','nomatch','error','end','result']){
          recognition.addEventListener(type,event=>{
            const item={type,elapsedMs:Math.round(performance.now()-startTime)};
            if(type==='error'){item.error=event.error;item.message=event.message;report.error=event.error;}
            if(type==='result'){
              item.results=Array.from(event.results,result=>({final:result.isFinal,transcript:result[0].transcript,confidence:result[0].confidence}));
              report.transcript=item.results.filter(result=>result.final).map(result=>result.transcript).join(' ').trim();
            }
            report.events.push(item);if(type==='end')finish('end');
          });
        }
        (async()=>{
          audioContext=new AudioContext();
          const response=await fetch(`/audio/daily/aria/${id}.mp3`);
          const decoded=await audioContext.decodeAudioData(await response.arrayBuffer());
          // Add leading and trailing silence so playback is not clipped before service readiness.
          const padded=audioContext.createBuffer(decoded.numberOfChannels,decoded.length+Math.ceil(decoded.sampleRate*2),decoded.sampleRate);
          for(let channel=0;channel<decoded.numberOfChannels;channel++)padded.getChannelData(channel).set(decoded.getChannelData(channel),Math.ceil(decoded.sampleRate*.5));
          bufferSource=audioContext.createBufferSource();bufferSource.buffer=padded;
          destination=audioContext.createMediaStreamDestination();bufferSource.connect(destination);
          await audioContext.resume();recognition.start(destination.stream.getAudioTracks()[0]);bufferSource.start();
          stopTimer=setTimeout(()=>recognition.stop(),Math.ceil(padded.duration*1000)+100);
        })().catch(error=>{report.error=`${error.name}: ${error.message}`;finish('exception');});
      });
    },{id,source}),new Promise(resolve=>{outerTimer=setTimeout(()=>resolve({id,source,error:'outer-timeout'}),12000)})]);
    clearTimeout(outerTimer);output.results.push(result);console.log(JSON.stringify({id,source,transcript:result.transcript,error:result.error,reason:result.reason}));
    await context.close();
  }
}finally{await browser.close();}
await writeFile('artifacts/daily-speech/native-five-phrase-results.json',JSON.stringify(output,null,2));
