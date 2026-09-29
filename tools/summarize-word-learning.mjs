import { readFileSync } from 'node:fs';
import { parseDailyProgress } from '../src/dailyProgress.ts';
if (!process.argv[2]) throw new Error('Usage: node tools/summarize-word-learning.mjs <exported-course.json>');
const parsed = parseDailyProgress(readFileSync(process.argv[2], 'utf8'));
if (!parsed.writable) throw new Error(parsed.warning);
const words = Object.entries(parsed.progress.learning?.targets ?? {}).filter(([id]) => /^(daily-word-|word-)/.test(id));
const report = words.map(([id, target]) => ({ id, readyAt: target.readyAt, confidence: target.confidence,
  dimensions: Object.fromEntries(Object.entries(target.evidence ?? {}).map(([name, value]) => [name, {
    ...value, independentRate: value.attempts ? value.independent / value.attempts : null,
    averageElapsedSeconds: value.attempts ? value.elapsedMs / value.attempts / 1000 : null,
  }])),
}));
console.log(JSON.stringify({ note: 'Elapsed time includes pauses. Dimensions overlap. Empty evidence is unmeasured, not zero accuracy.', words: report }, null, 2));
