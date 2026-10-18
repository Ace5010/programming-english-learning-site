import type { DailyExerciseSpec, DailyLessonSpec } from './dailyProgress';
import type { DailyLesson } from './dailyCourse';

export interface LearningTarget {
  introducedAt: number;
  confidence: number;
  abilities: Record<string, number>;
  lastSeenTurn: number;
  lastFailureTurn: number;
  signatures: string[];
  transfer: boolean;
  readyAt: number;
  reviewFeedbackAt?: number;
  contexts?: string[];
  independentRecallAt?: number;
  lastEvidenceAt?: number;
  lastErrorAbility?: 'spelling' | 'context';
  lastSessionId?: string;
  evidence?: Partial<Record<'recognition' | 'recall' | 'newContext' | 'laterSession', { attempts: number; independent: number; assisted: number; revealed: number; elapsedMs: number }>>;
}
export interface LearningState {
  version: 1;
  turns: number;
  rounds: number;
  targets: Record<string, LearningTarget>;
  lastAnswer?: string;
}
export interface AdaptivePlan {
  version: 1;
  round: number;
  focusIds: string[];
  newIds: string[];
  sourceLessonId: string;
  seed: number;
  budget: number;
}
export type LearningExercise = DailyExerciseSpec & {
  learningDifficulty?: 'recognition' | 'context' | 'recall';
  learningSignature?: string;
};
export type LearningLesson = DailyLesson & DailyLessonSpec & {
  practice: LearningExercise[];
  learningTargets: string[];
  learningGoal: 'reading' | 'communication' | 'listening';
  /** Optional prerequisite concepts and a smaller focus for absolute beginners. */
  prerequisiteIds?: string[];
  focusLimit?: number;
  /** Retained for lookup and old sessions, excluded from new adaptive rounds. */
  referenceOnly?: boolean;
};
