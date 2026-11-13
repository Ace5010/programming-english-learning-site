import React from 'react';
import {createRoot} from 'react-dom/client';
import ReadAloudText,{ReadAloudProvider} from '../../src/ReadAloud.tsx';
import {AudioPlayback} from '../../src/audioPlayback.ts';
import {contextualReadingQueue} from '../../src/contextualReading.ts';
import {readingPlaybackKey} from '../../src/readingAudio.ts';
export function mount(voice,cases){
  const host=document.createElement('div');host.id='context-test';document.body.append(host);window.__contextEvents=[];
  function Harness(){
    const [speaking,setSpeaking]=React.useState('');
    const [player]=React.useState(()=>new AudioPlayback(setSpeaking,key=>{throw new Error('Audio failed: '+key)},undefined,url=>{
      const audio=new Audio(url);
      audio.addEventListener('playing',()=>window.__contextEvents.push({url:window.__audioSource?.(audio.currentSrc) ?? audio.currentSrc,position:audio.currentTime,rate:audio.playbackRate,pitch:audio.preservesPitch}));return audio;
    }));window.__contextPlayer=player;
    return React.createElement(ReadAloudProvider,{speaking,pageKey:voice,play:(text,slow,context)=>{
      const clips=contextualReadingQueue(text,context,'',voice,slow,document.baseURI);
      if(!clips)throw new Error('Context was lost');player.playQueue(clips,1,readingPlaybackKey(text,slow));
    }},cases.map(([word,text],index)=>React.createElement('section',{'data-case':index,key:index},React.createElement(ReadAloudText,{text}))));
  }
  createRoot(host).render(React.createElement(Harness));
}
