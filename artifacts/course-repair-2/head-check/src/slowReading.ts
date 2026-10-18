import clips from './slowReadingClips.json' with { type: 'json' };
import { slowReadingUnits } from './slowReadingText.ts';
import { pronunciationKeys } from './slowPronunciations.ts';
import type { AudioClip } from './audioPlayback.ts';

type Clip = { path: string; startMs: number; endMs: number; leadingMs: number; trailingMs: number; version: string };
const recordings: Record<string, Clip> = clips;
export function slowReadingQueue(text: string, voice: 'aria' | 'guy', base: string): AudioClip[] | undefined {
  const units = slowReadingUnits(text);
  if (units.length < 2) return;
  const chosen = pronunciationKeys(text).map(token => {
    const clip = recordings[`${voice}:${token}`];
    if (!clip) throw new Error(`Missing slow recording: ${voice}:${token}`);
    return clip;
  });
  return chosen.map((clip, index) => ({
    url: new URL(`audio/${clip.path}?v=${clip.version}`, base).href,
    startMs: clip.startMs, endMs: clip.endMs,
    pauseMs: index + 1 < chosen.length ? Math.max(0, Math.round(units[index].pauseMs - (clip.trailingMs + chosen[index + 1].leadingMs) / .72)) : 0,
  }));
}
