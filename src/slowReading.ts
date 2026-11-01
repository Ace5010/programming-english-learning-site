import clips from './slowReadingClips.json' with { type: 'json' };
import { slowReadingUnits } from './slowReadingText.ts';
import { pronunciationKeys } from './slowPronunciations.ts';
import foundation from './foundationAudio.json' with { type: 'json' };
import type { AudioClip } from './audioPlayback.ts';

type Clip = { path: string; startMs: number; endMs: number; leadingMs: number; trailingMs: number; version: string };
const recordings: Record<string, Clip> = clips;
// Files are synthesized at -40%; playing at 1 preserves the recorded articulation.
export const slowPlaybackRate = 1;
const tutorialKeys = new Map(foundation.map(item => [item.text, `tutorial@${item.id}`]));
const clipURL = (clip: Clip, base: string) => new URL(`audio/${clip.path}?v=${clip.version}`, base).href;
export function continuousSlowQueue(text: string, voice: 'aria' | 'guy', base: string): AudioClip[] | undefined {
  const key = tutorialKeys.get(text);
  if (!key) return;
  const clip = recordings[`${voice}:${key}`];
  if (!clip) throw new Error(`Missing continuous slow recording: ${voice}:${key}`);
  return [{ url: clipURL(clip, base), startMs: clip.startMs, endMs: clip.endMs, pauseMs: 0 }];
}
export function slowReadingQueue(text: string, voice: 'aria' | 'guy', base: string, source = ''): AudioClip[] | undefined {
  const units = slowReadingUnits(text);
  if (!units.length) return;
  const chosen = pronunciationKeys(text, source).map(token => {
    const clip = recordings[`${voice}:${token}`] ?? (/^[A-Z][a-z]+$/.test(token) ? recordings[`${voice}:${token.toLowerCase()}`] : undefined);
    if (!clip) throw new Error(`Missing slow recording: ${voice}:${token}`);
    return clip;
  });
  return chosen.map((clip, index) => ({
    url: clipURL(clip, base),
    startMs: clip.startMs, endMs: clip.endMs,
    pauseMs: index + 1 < chosen.length ? Math.max(0, Math.round(units[index].pauseMs - (clip.trailingMs + chosen[index + 1].leadingMs) / slowPlaybackRate)) : 0,
  }));
}
