import { vocabulary } from '../../src/vocabulary.ts';
import { dailyPhrases } from '../../src/dailyCourse.ts';
import reading from '../../src/readingAudio.json' with {type:'json'};
import foundation from '../../src/foundationAudio.json' with {type:'json'};
import { slowReadingQueue } from '../../src/slowReading.ts';
export function expectedSlowQueue(source, voice, base) {
  const name=source.split('/').at(-1).split('?')[0].replace(/\.mp3$/,'');
  const word=/^(word|example)-(\d+)$/.exec(name);
  const text=word ? vocabulary.find(x=>x.id===Number(word[2]))?.[word[1]] : dailyPhrases.find(x=>x.id===name)?.en ?? [...reading,...foundation].find(x=>x.id===name)?.text;
  return text ? slowReadingQueue(text,voice,base) : undefined;
}
