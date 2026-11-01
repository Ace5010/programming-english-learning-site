import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { vocabulary } from '../src/vocabulary.ts';
import { dailyPhrases } from '../src/dailyCourse.ts';
import reading from '../src/readingAudio.json' with { type: 'json' };
import foundation from '../src/foundationAudio.json' with { type: 'json' };

export function audioOptimizationInventory() {
  const entries = [];
  for (const voice of ['aria', 'guy']) {
    for (const item of vocabulary) for (const kind of ['word', 'example']) {
      entries.push({ path: `${voice}/${kind}-${item.id}.mp3`, voice, kind, text: item[kind], vocabularyId: item.id });
    }
    entries.push({ path: `${voice}/voice-test.mp3`, voice, kind: 'sample', text: 'Repository. Function. Variable. Commit.' });
    for (const item of dailyPhrases) entries.push({ path: `daily/${voice}/${item.id}.mp3`, voice, kind: 'daily', text: item.en, ...(item.pronunciationContext ? { pronunciationContext: item.pronunciationContext } : {}) });
    for (const item of reading) entries.push({ path: `reading/${voice}/${item.id}.mp3`, voice, kind: 'reading', text: item.text });
    for (const item of foundation) entries.push({ path: `foundation/${voice}/${item.id}.mp3`, voice, kind: 'foundation', text: item.text, ...(item.ttsText ? { spoken: item.ttsText } : {}) });
  }
  return { version: 1, vocabulary, entries };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2]) {
  const target = resolve(process.argv[2]); mkdirSync(resolve(target, '..'), { recursive: true });
  const data = audioOptimizationInventory(); writeFileSync(target, JSON.stringify(data, null, 2) + '\n');
  console.log(JSON.stringify({ vocabulary: data.vocabulary.length, recordings: data.entries.length }));
}
