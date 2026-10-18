import { vocabulary } from './vocabulary.ts';
import { dailyPhrases } from './dailyCourse.ts';
import extra from './readingAudio.json' with { type: 'json' };
import { readingKey } from './readingText.ts';
import { foundationRecordings } from './foundationAudio.ts';

export type ReadingAudio = { id: string; path: string };
const recordings = new Map<string, ReadingAudio>();
for (const item of vocabulary) {
  recordings.set(readingKey(item.word), { id: `word-${item.id}`, path: `{voice}/word-${item.id}.mp3` });
}
for (const item of vocabulary) {
  const key = readingKey(item.example);
  if (!recordings.has(key)) recordings.set(key, { id: `example-${item.id}`, path: `{voice}/example-${item.id}.mp3?v=${encodeURIComponent(item.example)}` });
}
for (const item of dailyPhrases) {
  const key = readingKey(item.en);
  if (!recordings.has(key)) recordings.set(key, { id: `daily-${item.id}`, path: `daily/{voice}/${item.id}.mp3?v=${encodeURIComponent(item.en)}` });
}
for (const item of extra) recordings.set(readingKey(item.text), { id: item.id, path: `reading/{voice}/${item.id}.mp3?v=${encodeURIComponent(item.text)}` });
for (const item of foundationRecordings) if (!recordings.has(readingKey(item.text))) recordings.set(readingKey(item.text), { id: item.id, path: `foundation/{voice}/${item.id}.mp3?v=${encodeURIComponent(item.text)}` });

export const findReadingAudio = (text: string) => recordings.get(readingKey(text));
export const readingPlaybackKey = (text: string, slow = false) => `read-${findReadingAudio(text)?.id ?? ''}-${slow ? 'slow' : 'normal'}`;
