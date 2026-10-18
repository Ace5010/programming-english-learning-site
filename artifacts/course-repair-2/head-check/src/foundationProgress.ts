import type { DailyProgress, DailySession } from './dailyProgress';
import { foundationTopics } from './foundationCourse.ts';

export type FoundationProgress = DailyProgress & { retiredFoundationSession?: DailySession };
const retired = new Set(foundationTopics.filter(topic => topic.hidden).map(topic => topic.id));

/** Keep the full removed session, including its draft, without showing or
 * scheduling deleted teaching. Persist only when the user next saves progress. */
export function prepareFoundationLearning(progress: DailyProgress): FoundationProgress {
  const session = progress.session;
  if (!session || !retired.has(session.lessonId) && !session.adaptive?.focusIds.some(id => retired.has(id))) return progress;
  return { ...progress, session: null, retiredFoundationSession: session };
}
