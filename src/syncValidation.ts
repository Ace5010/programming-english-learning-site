import { assertSnapshot, type Snapshot } from './syncProtocol.ts';
import { parseDailyProgress } from './dailyProgress.ts';
import { adaptiveDailyLessons } from './dailyPractice.ts';
import { adaptiveProgrammingLessons } from './programmingPractice.ts';
import { parseReviewProgress } from './review.ts';

export function validateProgressSnapshot(value: unknown): asserts value is Snapshot {
  assertSnapshot(value);
  for (const key of ['codewords-mastered', 'codewords-favorites'] as const) {
    const ids = JSON.parse(value[key] ?? '[]');
    if (!Array.isArray(ids) || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw new Error('单词记录无法读取，原记录已保留。');
  }
  for (const key of ['codewords-quiz-sessions', 'codewords-best-score'] as const) {
    const count = JSON.parse(value[key] ?? '0');
    if (!Number.isSafeInteger(count) || count < 0) throw new Error('练习统计无法读取，原记录已保留。');
  }
  const history = JSON.parse(value['codewords-quiz-last-tested'] ?? '{}');
  if (!history || typeof history !== 'object' || Array.isArray(history) || Object.entries(history).some(([key, at]) => !/^[1-9]\d*$/.test(key) || typeof at !== 'number' || !Number.isFinite(at) || at < 0)) throw new Error('复习历史无法读取，原记录已保留。');
  parseReviewProgress(value['codewords-review-v1']);
  for (const [key, lessons] of [['codewords-daily-v1', adaptiveDailyLessons], ['codewords-programming-course-v1', adaptiveProgrammingLessons]] as const) {
    if (!parseDailyProgress(value[key], lessons).writable) throw new Error('课程记录损坏或来自新版，请先更新应用。原记录已保留。');
  }
}
