import entries from './foundationAudio.json' with { type: 'json' };
export const foundationRecordings = entries;
const audio = new Map(entries.map(item => [item.text, item]));
export function foundationRecording(text: string) { return audio.get(text); }
export function foundationAudioPath(text: string, voice: 'aria' | 'guy') {
  const entry = foundationRecording(text);
  return entry ? `audio/foundation/${voice}/${entry.id}.mp3?v=${encodeURIComponent(text)}` : undefined;
}
