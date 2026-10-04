import entries from './foundationAudio.json' with { type: 'json' };
export const foundationRecordings = entries.filter(item => !('tutorialOverride' in item && item.tutorialOverride));
const audio = new Map(foundationRecordings.map(item => [item.text, item]));
const tutorialAudio = new Map(entries.filter(item => 'tutorialOverride' in item && item.tutorialOverride).map(item => [item.text, item]));
export function foundationRecording(text: string) { return audio.get(text); }
export function foundationAudioPath(text: string, voice: 'aria' | 'guy', tutorial = false) {
  const entry = (tutorial ? tutorialAudio.get(text) : undefined) ?? foundationRecording(text);
  return entry ? `audio/foundation/${voice}/${entry.id}.mp3?v=${encodeURIComponent('ttsText' in entry ? String(entry.ttsText) : text)}` : undefined;
}
