import assert from 'node:assert/strict';
import { createDailyDraft, checkDailyAnswer } from '../../src/dailyProgress.ts';
import { choosePair } from '../../src/pairPractice.ts';

/** Solve public task content, including unused tiles and repeated tokens. */
export function correctDraft(task) {
  const draft = createDailyDraft(task);
  if (task.kind === 'choice' || task.kind === 'listen') draft.choice = task.answers[0];
  else if (task.kind === 'fill') draft.blanks = task.blanks.map(values => values[0]);
  else if (task.kind === 'write') draft.text = task.answers[0];
  else if (task.kind === 'speak') { draft.text = task.sample; draft.checks = task.checks.map(() => true); draft.speech = { mode: 'self', transcripts: {} }; }
  else if (task.kind === 'match') {
    for (const item of task.pairs) if (!draft.pairs.matches[item.id]) {
      draft.pairs = choosePair(task.pairs, { ...draft.pairs, selected: item.id }, item.id, 1800000000000);
    }
  } else if (task.kind === 'order') {
    const solve = (selected, available) => {
      const text = selected.map(index => task.options[index]).join(' ');
      if (task.answers.includes(text)) return selected;
      if (!task.answers.some(answer => answer.startsWith(text))) return null;
      for (const index of available) {
        const solution = solve([...selected, index], available.filter(value => value !== index));
        if (solution) return solution;
      }
      return null;
    };
    draft.order = solve([], task.options.map((_, index) => index));
    assert.ok(draft.order, `Unsolvable order: ${task.id}`);
  } else assert.fail(`Unhandled exercise: ${task.kind}`);
  assert.equal(checkDailyAnswer(task, draft).correct, true, task.id);
  return draft;
}
