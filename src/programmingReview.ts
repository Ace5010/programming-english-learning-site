import type { DailyCurriculum } from './DailyEnglish';
import type { DailyLesson } from './dailyCourse';
import { createDailySession, dailyLessonLearned, type DailyExerciseSpec, type DailyProgress } from './dailyProgress.ts';
import type { LearningLesson } from './learningTypes';
import { getSkill, reviewAbilities, isReviewEligible, type Ability, type ReviewProgress } from './review.ts';

type Target = DailyExerciseSpec & { wordIds: number[]; ability: Ability };

/** Later review difficulties become teaching material for the next generated lesson. */
export function applyProgrammingReviewToLearning(course: DailyProgress, progress: ReviewProgress): DailyProgress {
  const learning = course.learning ?? { version: 1 as const, turns: 0, rounds: 0, targets: {} };
  const targets = { ...learning.targets };
  let changed = false;
  for (const [id, word] of Object.entries(progress)) {
    if (word.source !== 'legacy' || targets[`word-${id}`]) continue;
    // A user-confirmed historical word is not a new teaching target. This is
    // admission evidence only; no correct answers or skill scores are invented.
    targets[`word-${id}`] = { introducedAt: word.enrolledAt ?? Date.now(), confidence: 1, abilities: {},
      lastSeenTurn: 0, lastFailureTurn: 0, signatures: [], transfer: true, readyAt: word.enrolledAt ?? Date.now() };
    changed = true;
  }
  for (const [id, old] of Object.entries(targets)) {
    const match = /^word-(\d+)$/.exec(id);
    if (!match) continue;
    const skills = reviewAbilities.map(ability => ({ ability, skill: getSkill(progress, Number(match[1]), ability) }))
      .filter(({ skill }) => skill.lastSource === 'review' && skill.needsPractice && skill.lastPracticedAt > (old.reviewFeedbackAt ?? old.readyAt));
    if (!skills.length) continue;
    targets[id] = { ...old, confidence: Math.min(old.confidence, 0.35), transfer: false,
      lastFailureTurn: learning.turns,
      reviewFeedbackAt: Math.max(...skills.map(({ skill }) => skill.lastPracticedAt)),
      abilities: { ...old.abilities, ...Object.fromEntries(skills.map(({ ability }) => [ability, 0.2])) } };
    changed = true;
  }
  return changed ? { ...course, learning: { ...learning, targets } } : course;
}
function target(exercise: DailyExerciseSpec): Target {
  const mapped = exercise as Target;
  if (!mapped.wordIds?.length || !reviewAbilities.includes(mapped.ability)) throw new Error('编程练习缺少能力目标。');
  return mapped;
}
const lessonPool = (lesson: DailyLesson) => [...new Map([...lesson.exercises, ...((lesson as Partial<LearningLesson>).practice ?? [])]
  .map(exercise => [exercise.id, exercise])).values()];

/** Scene and word practice share the same four skill records and due dates. */
export function programmingReview(progress: ReviewProgress, now = Date.now()): NonNullable<DailyCurriculum['review']> {
  const skills = (exercise: DailyExerciseSpec) => {
    const item = target(exercise);
    return item.wordIds.every(id => isReviewEligible(progress, id)) ? item.wordIds.map(id => getSkill(progress, id, item.ability)) : [];
  };
  const rank = (exercise: DailyExerciseSpec) => {
    const observed = skills(exercise);
    if (observed.some(skill => skill.needsPractice && skill.dueAt <= now)) return 0;
    if (observed.some(skill => skill.dueAt <= now)) return 1;
    if (observed.some(skill => skill.needsPractice)) return 2;
    return 3;
  };
  const difficulties = (lesson: DailyLesson, focus = 'auto') => lessonPool(lesson)
    .filter(exercise => (focus === 'auto' || target(exercise).ability === focus) && skills(exercise).some(skill => skill.needsPractice)).map(exercise => exercise.id);
  return {
    options: [{ value: 'context', label: '阅读理解' }, { value: 'meaning', label: '词义' },
      { value: 'spelling', label: '拼写' }, { value: 'listening', label: '听力' }],
    ability: exercise => target(exercise).ability,
    lessons: (course, lessons, focus = 'auto') => lessons.filter(lesson => dailyLessonLearned(course, lesson)
      && lessonPool(lesson).some(exercise => (focus === 'auto' || target(exercise).ability === focus) && rank(exercise) < 3)),
    difficulties,
    session: (lesson, focus) => {
      let exercises = lessonPool(lesson).filter(exercise => skills(exercise).length > 0
        && (focus === 'auto' || target(exercise).ability === focus));
      exercises = [...exercises].sort((a, b) => rank(a) - rank(b)
        || reviewAbilities.indexOf(target(a).ability) - reviewAbilities.indexOf(target(b).ability));
      if (focus === 'auto') {
        const due = exercises.filter(exercise => rank(exercise) <= 1);
        const weak = exercises.filter(exercise => rank(exercise) === 2);
        if (due.length || weak.length) exercises = due.length ? due : weak;
      }
      return { ...createDailySession({ ...lesson, exercises: exercises.slice(0, 5) }, 'review', now), focused: true };
    },
  };
}
