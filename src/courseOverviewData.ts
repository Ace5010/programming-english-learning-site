import type { DailyProgress } from './dailyProgress';
import type { LearningLesson } from './learningTypes';
import { previewAdaptiveScope } from './adaptiveLearning.ts';

/** Presentation only: no random values, timestamps, persistence, or question selection. */
export function courseOverview(progress: DailyProgress, lessons: LearningLesson[]) {
  const saved = progress.session?.mode === 'lesson' && progress.session.stage !== 'summary' ? progress.session : null;
  // An unfinished review can still change the next round's focus.
  if (!saved && progress.session && progress.session.stage !== 'summary') return null;
  const scope = saved?.adaptive ?? (saved ? null : previewAdaptiveScope(progress, lessons));
  const source = lessons.find(item => item.id === (scope?.sourceLessonId ?? saved?.lessonId));
  if (!source) return null;
  const ids = scope?.focusIds ?? source.learningTargets;
  const phrases = [...new Map(lessons.flatMap(item => item.phrases).map(item => [item.id, item])).values()];
  const targets = ids.flatMap(id => { const phrase = phrases.find(item => item.id === id); return phrase ? [phrase] : []; });
  const sources = [source];
  const covered = new Set(source.learningTargets);
  for (const id of ids) {
    if (covered.has(id)) continue;
    const extra = lessons.find(item => item.learningTargets.includes(id));
    if (extra) { sources.push(extra); extra.learningTargets.forEach(target => covered.add(target)); }
  }
  const newCount = scope?.newIds.length;
  const oldCount = newCount === undefined ? undefined : ids.length - newCount;
  const arrangement = newCount === undefined ? '继续已保存的课程，保留原来的学习与练习位置。'
    : newCount === 0 ? '本轮集中巩固还不熟悉的内容，暂不增加新内容。'
      : oldCount === 0 ? '本轮先学习新内容，再根据作答情况逐步巩固。'
        : `本轮学习 ${newCount} 条新内容，同时穿插巩固 ${oldCount} 条还不熟悉的内容。`;
  const reading = source.learningGoal === 'reading';
  const wordCheck = source.courseMode === 'word-check';
  const shortMeaning = (text: string) => text.split(/[；;]/)[0].replace(/[。！!？?]$/, '');
  const meanings = [...new Set(targets.map(item => shortMeaning(item.zh)))].slice(0, 3);
  return {
    source, targets, newCount, oldCount, arrangement, reading, wordCheck, budget: scope?.budget, resume: !!saved,
    testStarted: wordCheck && !!saved && saved.stage !== 'study',
    studyPhrases: wordCheck ? targets.flatMap(target => {
      const example = phrases.find(phrase => phrase.id === target.id.replace(/^word-/, 'example-'));
      return example ? [target, example] : [target];
    }) : targets,
    round: scope?.round ?? (progress.learning?.rounds ?? lessons.filter(item => progress.lessons[item.id]?.completedAt).length) + 1,
    title: sources.map(item => item.title).join('、'),
    goal: meanings.length ? `${reading ? '读懂' : '辨认'}“${meanings.join('”“')}”${targets.length > meanings.length ? '等' : '对应的'}${reading ? '词语，理解它们在短句中的意思。' : '英语表达，理解它们的用法。'}` : source.goal,
    scenes: sources.map(item => ({ id: item.id, title: item.learningTargets.every(id => ids.includes(id)) ? item.goal
      : `在${reading ? '短句' : '对话'}中辨认${targets.filter(phrase => item.learningTargets.includes(phrase.id)).map(phrase => `“${shortMeaning(phrase.zh)}”`).join('、')}。` })),
    direction: reading ? '从词语含义入手，再联系短句理解阅读内容。' : '先把表达的声音、文字与意思联系起来，再练习在对话中使用。',
  };
}
