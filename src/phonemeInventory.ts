// Traditional British teaching inventory: 12 monophthongs, 8 diphthongs, 24 consonants.
// Symbols and the exact sound/word file pairs were checked against Cambridge's
// public pronunciation guide on 2026-09-27. Local copies retain their source metadata.
export const phonemicSource = 'https://dictionary.cambridge.org/help/phonetics.html';
export type Phoneme = {
  id: string; ipa: string; word: string; meaning: string; group: 'vowels' | 'diphthongs' | 'consonants';
  instruction: string; compare?: string; file: string;
};
type Row = [string, string, string, string, string, string?, string?];
const vowels: Row[] = [
  ['ee', 'iː', 'sheep', '绵羊', '舌前部抬高，嘴唇自然向两侧展开。保持同一个音，不滑向另一个音。', 'ih'],
  ['ih', 'ɪ', 'ship', '船', '嘴唇放松，舌前部抬高但比 /iː/ 略低。区别不只是长短，口腔也要更放松。', 'ee'],
  ['uu', 'ʊ', 'foot', '脚', '嘴唇轻轻收圆，舌后部抬起，保持放松；不要把嘴唇过分向前伸。', 'oo'],
  ['oo', 'uː', 'blue', '蓝色', '嘴唇收圆，舌身抬高，持续发声；不要在末尾加一个新的音节。', 'uu'],
  ['eh', 'e', 'head', '头', '嘴巴适度张开，舌前部抬起但不顶住上颚。比 /æ/ 开口小。', 'ae'],
  ['schwa', 'ə', 'above', '在上方', '嘴和舌头自然放松，短而轻地发声。例词中听开头那个没有重音的音。', 'er'],
  ['er', 'ɜː', 'bird', '鸟', '嘴唇放松，舌身放在口腔中部，稳定发声。这里采用英式，不卷出美式 r 音。', 'schwa'],
  ['aw', 'ɔː', 'horse', '马', '嘴唇收圆，舌后部抬起，开口适中。这里的英式例词不在元音后加 r 音。', 'oh'],
  ['ae', 'æ', 'hat', '帽子', '嘴巴张得比 /e/ 更开，舌前部较低，嘴唇不收圆。', 'eh'],
  ['uh', 'ʌ', 'cup', '杯子', '嘴唇放松、不收圆，嘴巴自然张开，短促发声。例词中的这个音有重音。', 'schwa'],
  ['ah', 'ɑː', 'father', '父亲', '嘴巴张开，舌身放低、偏后，嘴唇不收圆。保持声音，不额外卷舌。', 'oh'],
  ['oh', 'ɒ', 'sock', '袜子', '嘴巴张开，嘴唇略收圆，舌身偏后且较低。比 /ɔː/ 开口更大。', 'aw'],
];
const diphthongs: Row[] = [
  ['ay', 'eɪ', 'day', '一天', '从 /e/ 附近自然滑向 /ɪ/，前面更突出，末尾较轻；连成一个音节。', 'ai', 'day_2023feb_002'],
  ['ai', 'aɪ', 'eye', '眼睛', '从张口的元音滑向 /ɪ/，嘴巴逐渐收小；中间不要断开。', 'ay'],
  ['oy', 'ɔɪ', 'boy', '男孩', '先收圆嘴唇，再滑向 /ɪ/，嘴唇逐渐放松；不要分成两个音节。', 'ai'],
  ['ow', 'əʊ', 'nose', '鼻子', '从口腔中部的元音起音，再向 /ʊ/ 滑动，嘴唇逐渐收圆。', 'au'],
  ['au', 'aʊ', 'mouth', '嘴', '先张开嘴，再滑向 /ʊ/，嘴巴收小、嘴唇收圆，声音连续。', 'ow'],
  ['ear', 'ɪə', 'ear', '耳朵', '从 /ɪ/ 滑向放松的 /ə/，嘴巴略放开。按本表的传统英式示范跟读。', 'air'],
  ['air', 'eə', 'hair', '头发', '从 /e/ 附近移向中央的 /ə/。现代英式里也常听到更平稳的长元音。', 'ear'],
  ['ure', 'ʊə', 'pure', '纯净的', '从 /ʊ/ 滑向 /ə/，嘴唇逐渐放松。不同英式说话者也可能使用 /ɔː/ 一类的读法。', 'aw'],
];
const consonants: Row[] = [
  ['p', 'p', 'pen', '钢笔', '双唇合拢挡住气流，再迅速放开。声带不振动；不要把它读成字母名。', 'b'],
  ['b', 'b', 'book', '书', '双唇合拢再放开，并加入声带振动。放开后不要刻意加“呃”。', 'p'],
  ['t', 't', 'town', '城镇', '舌尖抵住上门齿后面的齿龈，短暂挡住气流，再放开。声带不振动。', 'd'],
  ['d', 'd', 'day', '一天', '舌尖抵住齿龈再放开，并加入声带振动；不是字母 D 的名称。', 't', 'day_2023feb_001'],
  ['k', 'k', 'cat', '猫', '舌后部抵住软腭，短暂挡住气流，再放开。声带不振动。', 'g'],
  ['g', 'g', 'give', '给', '舌后部抵住软腭再放开，并加入声带振动。不要在末尾另加元音。', 'k'],
  ['ch', 'tʃ', 'cheese', '奶酪', '舌头先在齿龈后方挡住气流，再放开成摩擦声。整个动作连在一起，声带不振动。', 'j'],
  ['j', 'dʒ', 'jump', '跳', '先挡住气流，再在齿龈后方释放成摩擦声，同时加入声带振动。', 'ch'],
  ['f', 'f', 'fish', '鱼', '上门齿轻触下唇，让气流从缝隙中擦过。声带不振动，不要咬紧。', 'v'],
  ['v', 'v', 'very', '很', '上门齿轻触下唇，一边让气流擦过，一边加入声带振动。', 'f'],
  ['th', 'θ', 'think', '想', '舌尖轻靠上门齿或稍伸到两齿之间，让气流擦过。声带不振动，不要变成 /s/。', 'dh'],
  ['dh', 'ð', 'this', '这个', '舌尖轻靠门齿，让气流擦过，同时加入声带振动。不要把气流完全堵住。', 'th'],
  ['s', 's', 'say', '说', '舌尖靠近齿龈，让气流沿舌头中间的窄缝通过。声带不振动。', 'z'],
  ['z', 'z', 'zoo', '动物园', '保持 /s/ 附近的舌位，让气流擦过，同时加入声带振动。', 's'],
  ['sh', 'ʃ', 'she', '她', '舌前部靠近齿龈后方，嘴唇略向前，让气流摩擦通过。声带不振动。', 'zh'],
  ['zh', 'ʒ', 'vision', '视力', '保持 /ʃ/ 附近的舌位，加入声带振动。例词中听中间的摩擦声。', 'sh'],
  ['m', 'm', 'moon', '月亮', '双唇合拢，声带振动，让气流从鼻腔出去。嘴巴不必放开。', 'n'],
  ['n', 'n', 'name', '名字', '舌尖抵住齿龈，声带振动，让气流从鼻腔出去。', 'ng'],
  ['ng', 'ŋ', 'sing', '唱歌', '舌后部抵住软腭，声带振动，让气流从鼻腔出去。例词末尾不要额外加 /g/。', 'n'],
  ['h', 'h', 'hand', '手', '嘴巴为后面的元音做好准备，轻轻呼气；不要用舌后部制造强烈摩擦。'],
  ['l', 'l', 'look', '看', '舌尖触到齿龈，声带振动，气流从舌头两侧通过。这里示范词首的 l。', 'r'],
  ['r', 'r', 'run', '跑', '舌头靠近口腔上部但不要抵住或弹动，声带振动。这里的符号 r 表示英语的近音。', 'l'],
  ['w', 'w', 'we', '我们', '嘴唇先收圆、舌后部抬起，再迅速滑向后面的元音。不要用上齿碰下唇。', 'v'],
  ['y', 'j', 'yes', '是的', '舌前部抬向硬腭但不堵住气流，再滑向后面的元音。符号 /j/ 不是字母 J 的读音。', 'j'],
];
const make = (rows: Row[], group: Phoneme['group']): Phoneme[] => rows.map(([id, ipa, word, meaning, instruction, compare, file]) => ({ id, ipa, word, meaning, instruction, compare, group, file: file ?? `${word}_2023feb` }));
export const phonemes = [...make(vowels, 'vowels'), ...make(diphthongs, 'diphthongs'), ...make(consonants, 'consonants')];
export const phonemeGroups = [
  { id: 'vowels', title: '单元音', description: '12 个 · 保持一个主要口型' },
  { id: 'diphthongs', title: '双元音', description: '8 个 · 从一个口型滑向另一个' },
  { id: 'consonants', title: '辅音', description: '24 个 · 先看嘴和舌头在哪里挡住气流' },
] as const;
export type PhonemeAudioKind = 'sound' | 'word';
export function phonemeAudioURL(id: string, kind: PhonemeAudioKind) {
  const item = phonemes.find(item => item.id === id);
  if (!item) throw new Error(`Unknown phoneme: ${id}`);
  return `https://dictionary.cambridge.org/media/english/uk_phonetic/uk_phonetics_${kind}_${item.file}.mp3`;
}
export function phonemeAudioPath(id: string, kind: PhonemeAudioKind) {
  const item = phonemes.find(item => item.id === id);
  if (!item) throw new Error(`Unknown phoneme: ${id}`);
  return `audio/phonemes/uk/uk_phonetics_${kind}_${item.file}.mp3`;
}
export const phonemeAudioKey = (id: string, kind: PhonemeAudioKind, slow = false) => `phonetic-${id}-${kind}-${slow ? 'slow' : 'normal'}`;
