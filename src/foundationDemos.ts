import { phonemeAudioPath, phonemes } from './phonemeInventory.ts';
import versions from './foundationDemoVersions.json' with { type: 'json' };

// Fixed, packaged tutorial demonstrations; voice selection does not mix the
// two members of a contrast. The source manifest is checked at build time.
export const foundationDemoDefinitions = [
  { id: 'uk-map', text: 'map', path: 'audio/foundation/demos/uk-map.mp3', voice: 'Cambridge UK', source: 'https://dictionary.cambridge.org/dictionary/english/map' },
  { id: 'uk-ship', text: 'ship', path: 'audio/foundation/demos/uk-ship.mp3', voice: 'Cambridge UK', source: 'https://dictionary.cambridge.org/dictionary/english/ship' },
  { id: 'focus-i', text: 'I want tea.', path: 'audio/foundation/demos/focus-i.mp3', voice: 'Microsoft David Desktop - English (United States)', xml: '<pitch absmiddle="-3"><pitch absmiddle="10"><rate speed="-2"><emph>I</emph></rate></pitch> want tea.</pitch>' },
  { id: 'focus-tea', text: 'I want tea.', path: 'audio/foundation/demos/focus-tea.mp3', voice: 'Microsoft David Desktop - English (United States)', xml: '<pitch absmiddle="-3">I want <pitch absmiddle="10"><rate speed="-2"><emph>tea</emph></rate></pitch>.</pitch>' },
  { id: 'ready-flow', text: 'Yes, I am ready.', path: 'audio/foundation/demos/ready-flow.mp3', voice: 'Microsoft David Desktop - English (United States)', xml: 'Yes I am ready.' },
  { id: 'ready-pause', text: 'Yes, I am ready.', path: 'audio/foundation/demos/ready-pause.mp3', voice: 'Microsoft David Desktop - English (United States)', xml: 'Yes<silence msec="400"/> I am ready.' },
] as const;
export function foundationDemoPath(id: string) {
  if (id.startsWith('sound:')) {
    const phoneme = id.slice(6);
    if (!phonemes.some(item => item.id === phoneme)) throw new Error(`Unknown tutorial sound: ${id}`);
    return phonemeAudioPath(phoneme, 'sound');
  }
  const item = foundationDemoDefinitions.find(item => item.id === id);
  if (!item) throw new Error(`Unknown tutorial demonstration: ${id}`);
  const fingerprints: Record<string, string> = versions;
  return `${item.path}?v=${fingerprints[id]}`;
}
export const foundationDemoKey = (id: string, slow = false) => `foundation-demo-${id}-${slow ? 'slow' : 'normal'}`;
