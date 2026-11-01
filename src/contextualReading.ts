import normalClips from './contextualAudioClips.json' with { type: 'json' };
import slowClips from './slowReadingClips.json' with { type: 'json' };
import { pronunciationKeys } from './slowPronunciations.ts';
import { slowReadingUnits } from './slowReadingText.ts';
import { spokenEnglish } from './readingText.ts';
import type { AudioClip } from './audioPlayback.ts';

type Clip = { path: string; startMs: number; endMs: number; version: string };
export function contextualReadingQueue(text: string, context: string, source: string, voice: 'aria' | 'guy', slow: boolean, base: string): AudioClip[] | undefined {
  text = spokenEnglish(text);
  if (!text || slowReadingUnits(text).length !== 1) return;
  const sentence = spokenEnglish(context) || text;
  const units = slowReadingUnits(sentence);
  const index = units.findIndex(unit => unit.text.toLowerCase() === text.toLowerCase());
  const key = pronunciationKeys(sentence, source)[index];
  if (!key?.includes('@')) return;
  const recordings: Record<string, Clip> = slow ? slowClips : normalClips;
  const clip = recordings[`${voice}:${key}`];
  if (!clip) throw new Error(`Missing contextual recording: ${voice}:${key}`);
  return [{ url: new URL(`audio/${clip.path}?v=${clip.version}`, base).href, startMs: clip.startMs, endMs: clip.endMs, pauseMs: 0 }];
}
