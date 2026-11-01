import { slowReadingUnits } from './slowReadingText.ts';

/** Reviewed heteronyms in the current corpus; context supplies TTS pronunciation, not UI text. */
export const contextualReadings = [
  { text: 'live@verb', spoken: 'I live here.', targetIndex: 1 },
  { text: 'live@adjective', spoken: 'A live show.', targetIndex: 1 },
  { text: 'use@verb', spoken: 'I use it.', targetIndex: 1 },
  { text: 'use@noun', spoken: 'For personal use.', targetIndex: 2 },
  { text: 'record@verb', spoken: 'Please record it.', targetIndex: 1 },
  { text: 'record@noun', spoken: 'A written record.', targetIndex: 2 },
  { text: 'close@verb', spoken: 'Close the door.', targetIndex: 0 },
  { text: 'close@adjective', spoken: 'A close friend.', targetIndex: 1 },
  { text: 'read@present', spoken: 'Please read it.', targetIndex: 1 },
  { text: 'read@past', spoken: 'I have read it.', targetIndex: 2 },
  { text: 'used@habit', spoken: 'I used to walk.', targetIndex: 1 },
  { text: 'used@past', spoken: 'I used a pen.', targetIndex: 1 },
  { text: 'refuse@noun', spoken: 'Refuse collection.', targetIndex: 0 },
  { text: 'refuse@verb', spoken: 'Refuse this offer.', targetIndex: 0 },
];
const liveVerbs = new Set(['His friends live above the bookshop.', 'I live in China.', 'I live in Japan.', 'My grandparents live in Sussex.', 'Nearly 70 percent of the population still live in the countryside.']);
const nounUses = new Set(['He made some notes for his private use.', 'The car is for personal use only.']);
const pastRead = new Set(['I read your article with great interest.', 'She had read about it in the newspapers.']);
export function pronunciationKeys(text: string, source = '') {
  return slowReadingUnits(text).map(unit => {
    const lower = unit.text.toLowerCase();
    if (lower === 'live') return liveVerbs.has(text) || (text.toLowerCase() === 'live' && source.includes('/daily/')) ? 'live@verb' : 'live@adjective';
    if (lower === 'use') return nounUses.has(text) ? 'use@noun' : 'use@verb';
    if (lower === 'record') return text.toLowerCase() === 'record' || text === 'Her husband made her record every penny she spent.' ? 'record@verb' : 'record@noun';
    if (lower === 'close') return text === 'her close friendship with her aunt' ? 'close@adjective' : 'close@verb';
    if (lower === 'read') return pastRead.has(text) ? 'read@past' : 'read@present';
    if (lower === 'used') return (text.toLowerCase() === 'used' || /used to/.test(text)) && text !== 'The data can be used to make useful economic predictions.' ? 'used@habit' : 'used@past';
    if (lower === 'refuse') return text === 'We refuse to talk to terrorists.' ? 'refuse@verb' : 'refuse@noun';
    return unit.text;
  });
}
