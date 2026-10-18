import type { DailyExerciseSpec } from './dailyProgress.ts';

/** New practice reuses taught sentences verbatim, including their existing recording. */
export function sentenceVariants(en: string, zh: string, audioId: string, distractors: string[] = []): (Omit<DailyExerciseSpec, 'id'> & { variant: string; distractor?: string })[] {
  const words = [...en.matchAll(/\S+/g)];
  const result: (Omit<DailyExerciseSpec, 'id'> & { variant: string; distractor?: string })[] = [];
  if (words.length < 2 || words.length > 10) return result;
  const missing = [...en.matchAll(/\b[A-Za-z]{3,}\b/g)].filter(match => !['the', 'this', 'that', 'are', 'you', 'and'].includes(match[0].toLowerCase())).sort((a, b) => b[0].length - a[0].length)[0];
  const explanation = `${en} 表示“${zh}”。`;
  if (missing) result.push({ variant: 'listen-gap', kind: 'fill', audioPrompt: true, audioId,
    prompt: '听完整句子，补上缺少的词。', parts: [en.slice(0, missing.index), en.slice(missing.index! + missing[0].length)], blanks: [[missing[0]]], explanation });
  if (words.length >= 4) {
    const blocks: string[] = [];
    for (let index = 0; index < words.length; index += 2) blocks.push(words.slice(index, index + 2).map(item => item[0]).join(' '));
    result.push({ variant: 'order-blocks', kind: 'order', prompt: `用词组拼出这句话：\n${zh}`, options: [...blocks.slice(1), blocks[0]], answers: [en], explanation });
  }
  const options = words.map(item => item[0]);
  const unused = [...new Set(distractors)].filter(word => /^[a-z]{2,12}$/i.test(word) && !options.some(option => option.toLowerCase().replace(/[.!?,]/g, '') === word.toLowerCase()));
  if (unused.length && words.length >= 3 && words.length <= 7) result.push({ variant: 'order-words', distractor: unused[0], kind: 'order', prompt: `选出需要的词，组成这句话：\n${zh}`, options: [...options.slice(1), unused[0], options[0]], answers: [en], explanation });
  return result;
}
