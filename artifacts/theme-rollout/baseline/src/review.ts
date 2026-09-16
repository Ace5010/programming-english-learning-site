import type { VocabularyItem } from './vocabulary';

export type Ability = 'meaning' | 'spelling';
export type SpellingLevel = 0 | 1 | 2 | 3;
export type Outcome = 'independent' | 'assisted' | 'revealed';

export interface SkillProgress {
  level: SpellingLevel;
  streak: number;
  intervalDays: number;
  dueAt: number;
  lastPracticedAt: number;
  lastSuccessDay: string;
  lastFailureDay: string;
  needsPractice: boolean;
}

export interface WordProgress {
  meaning: SkillProgress;
  spelling: SkillProgress;
}

export type ReviewProgress = Record<string, WordProgress>;
export interface ReviewQuestion { wordId: number; ability: Ability; level: SpellingLevel; retry: boolean; exposed?: boolean }
export interface ReviewAnswer { question: ReviewQuestion; outcome: Outcome }
export interface ReviewSession {
  id: string;
  items: VocabularyItem[];
  questions: ReviewQuestion[];
  answers: ReviewAnswer[];
  index: number;
  finished: boolean;
}

export const REVIEW_KEY = 'codewords-review-v1';
const intervals = [1, 3, 7, 14, 30];
const abilities: Ability[] = ['meaning', 'spelling'];

function freshSkill(): SkillProgress {
  return { level: 0, streak: 0, intervalDays: 0, dueAt: 0, lastPracticedAt: 0, lastSuccessDay: '', lastFailureDay: '', needsPractice: false };
}

export function getSkill(progress: ReviewProgress, wordId: number, ability: Ability): SkillProgress {
  return progress[String(wordId)]?.[ability] ?? freshSkill();
}

export function spellingMode(level: SpellingLevel): 'gap' | 'tiles' | 'gaps' | 'type' {
  return (['gap', 'tiles', 'gaps', 'type'] as const)[level];
}

function localDay(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function afterDays(timestamp: number, days: number): number {
  const date = new Date(timestamp);
  date.setDate(date.getDate() + days);
  return date.getTime();
}

/** Legacy timestamps only affect selection; they never imply an ability level. */
export function createReviewSession(
  pool: VocabularyItem[],
  progress: ReviewProgress,
  legacyHistory: Record<string, number>,
  now = Date.now(),
): ReviewSession {
  const unique = [...new Map(pool.map(item => [item.id, item])).values()];
  const candidates = unique.map(item => {
    const skills = abilities.map(ability => getSkill(progress, item.id, ability));
    const legacy = legacyHistory[String(item.id)];
    const lastTested = Math.max(...skills.map(skill => skill.lastPracticedAt), Number.isFinite(legacy) ? legacy : 0);
    const untested = lastTested === 0;
    const weakDue = skills.some(skill => skill.needsPractice && skill.dueAt <= now);
    const due = skills.some(skill => skill.dueAt <= now);
    const weak = skills.some(skill => skill.needsPractice);
    const rank = weakDue ? 0 : untested ? 1 : due ? 2 : weak ? 3 : 4;
    return { item, untested, rank, dueAt: Math.min(...skills.map(skill => skill.dueAt)), lastTested };
  }).sort((a, b) => a.rank - b.rank || a.dueAt - b.dueAt || a.lastTested - b.lastTested || a.item.id - b.item.id);
  const selected = candidates.slice(0, 5);
  const newCandidate = candidates.find(candidate => candidate.untested);
  if (newCandidate && selected.length === 5 && !selected.some(candidate => candidate.untested)) {
    selected[4] = newCandidate;
  }
  const items = selected.map(candidate => candidate.item);
  const plans = items.map(item => {
    const need = (ability: Ability) => {
      const skill = getSkill(progress, item.id, ability);
      return skill.needsPractice && skill.dueAt <= now ? 0 : skill.dueAt <= now ? 1 : skill.needsPractice ? 2 : 3;
    };
    const first: Ability = need('spelling') < need('meaning') ? 'spelling' : 'meaning';
    const other: Ability = first === 'meaning' ? 'spelling' : 'meaning';
    const firstSkill = getSkill(progress, item.id, first);
    const otherSkill = getSkill(progress, item.id, other);
    const second = firstSkill.needsPractice && !otherSkill.needsPractice && otherSkill.lastSuccessDay !== '' && otherSkill.dueAt > now ? first : other;
    return { item, first, second };
  });
  // The first question for each word is recall evidence. Later appearances
  // follow an answer reveal, so they teach without claiming delayed recall.
  const questions = [false, true].flatMap(exposed => plans.map(plan => {
    const ability = exposed ? plan.second : plan.first;
    return { wordId: plan.item.id, ability, level: getSkill(progress, plan.item.id, ability).level, retry: false, exposed };
  }));
  return { id: `${now}-${Math.random().toString(36).slice(2, 10)}`, items, questions, answers: [], index: 0, finished: items.length === 0 };
}

/** Record once, then wait for an explicit Next action. No unbounded retry loops. */
export function applyReviewAnswer(session: ReviewSession, outcome: Outcome): ReviewSession {
  if (session.finished || session.answers.length > session.index) return session;
  const question = session.questions[session.index];
  if (!question) return session;
  const answers = [...session.answers, { question, outcome }];
  const questions = [...session.questions];
  const failed = answers.filter(answer => !answer.question.retry && answer.outcome !== 'independent');
  const pending = new Map<number, ReviewAnswer>();
  for (const answer of failed) {
    const previous = pending.get(answer.question.wordId);
    // A revealed answer is a larger difficulty than an assisted completion;
    // equally serious mistakes use the most recent ability for the one retry.
    if (!previous || answer.outcome === 'revealed' || previous.outcome !== 'revealed') pending.set(answer.question.wordId, answer);
  }
  for (const answer of pending.values()) {
    const failedQuestion = answer.question;
    const existing = questions.findIndex(candidate => candidate.wordId === failedQuestion.wordId && candidate.retry);
    if (existing >= 0) {
      if (existing > session.index) questions[existing] = { ...failedQuestion, retry: true, exposed: true };
      continue;
    }
    const lastPosition = questions.reduce((last, candidate, index) => candidate.wordId === failedQuestion.wordId ? index : last, -1);
    // Never call immediate repetition an interval check. A single-word pool
    // and an error on the final word may therefore wait until a later session.
    if (questions.length - lastPosition < 2) continue;
    questions.push({ ...failedQuestion, retry: true, exposed: true });
  }
  return { ...session, questions, answers };
}

export function advanceReviewSession(session: ReviewSession): ReviewSession {
  if (session.finished || session.answers.length <= session.index) return session;
  const index = session.index + 1;
  return { ...session, index, finished: index >= session.questions.length };
}

export function updateReviewProgress(
  progress: ReviewProgress,
  question: ReviewQuestion,
  outcome: Outcome,
  now = Date.now(),
): ReviewProgress {
  const previous = getSkill(progress, question.wordId, question.ability);
  const day = localDay(now);
  const firstToday = previous.lastPracticedAt === 0 || localDay(previous.lastPracticedAt) !== day;
  let next: SkillProgress = { ...previous, lastPracticedAt: now };
  if (outcome !== 'independent') {
    const harderPractice = question.ability === 'spelling' && question.exposed && question.level > previous.level;
    next = {
      ...next,
      // A harder practice attempt does not invalidate the easier format the
      // learner has already established. Same-day repeats also demote once.
      level: !harderPractice && previous.lastFailureDay !== day ? Math.max(0, previous.level - 1) as SpellingLevel : previous.level,
      streak: 0,
      intervalDays: 1,
      dueAt: previous.lastFailureDay === day && previous.dueAt > now ? Math.min(previous.dueAt, afterDays(now, 1)) : afterDays(now, 1),
      lastFailureDay: day,
      needsPractice: true,
    };
  } else if (!question.retry && !question.exposed && firstToday && previous.lastFailureDay !== day && previous.lastSuccessDay !== day && previous.dueAt <= now
    && (question.ability === 'meaning' || question.level === previous.level)) {
    const successes = previous.streak + 1;
    const promoted = question.ability === 'spelling' && previous.level < 3 && successes >= 2;
    // A new spelling format needs fresh evidence. Schedule it tomorrow instead
    // of carrying the easier format's confidence into a long review interval.
    const streak = promoted ? 0 : successes;
    const intervalDays = promoted ? 1 : intervals[Math.min(successes - 1, intervals.length - 1)];
    next = {
      ...next,
      level: promoted ? previous.level + 1 as SpellingLevel : previous.level,
      streak,
      intervalDays,
      dueAt: afterDays(now, intervalDays),
      lastSuccessDay: day,
      needsPractice: false,
    };
  } else if (previous.dueAt === 0) {
    // A newly encountered follow-up has no unexposed evidence yet. Give it a
    // next-day baseline without treating the just-seen answer as retention.
    next = { ...next, intervalDays: 1, dueAt: afterDays(now, 1) };
  }
  const word = progress[String(question.wordId)] ?? { meaning: freshSkill(), spelling: freshSkill() };
  return { ...progress, [String(question.wordId)]: { ...word, [question.ability]: next } };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validDay(value: unknown): value is string {
  if (value === '') return true;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDay(date.getTime()) === value;
}

function parseSkill(value: unknown): SkillProgress {
  if (!isRecord(value)
    || !Number.isInteger(value.level) || Number(value.level) < 0 || Number(value.level) > 3
    || !Number.isSafeInteger(value.streak) || Number(value.streak) < 0
    || !Number.isInteger(value.intervalDays) || Number(value.intervalDays) < 0 || Number(value.intervalDays) > 30
    || typeof value.dueAt !== 'number' || !Number.isFinite(value.dueAt) || value.dueAt < 0 || value.dueAt > 8.64e15
    || typeof value.lastPracticedAt !== 'number' || !Number.isFinite(value.lastPracticedAt) || value.lastPracticedAt < 0 || value.lastPracticedAt > 8.64e15
    || !validDay(value.lastSuccessDay) || !validDay(value.lastFailureDay)
    || typeof value.needsPractice !== 'boolean') {
    throw new Error('复习记录格式无效，原始记录已保留。');
  }
  return {
    level: value.level as SpellingLevel,
    streak: value.streak as number,
    intervalDays: value.intervalDays as number,
    dueAt: value.dueAt,
    lastPracticedAt: value.lastPracticedAt,
    lastSuccessDay: value.lastSuccessDay,
    lastFailureDay: value.lastFailureDay,
    needsPractice: value.needsPractice,
  };
}

/** Throw on bad existing data, so the caller can disable writes instead of erasing it. */
export function parseReviewProgress(raw: string | null): ReviewProgress {
  if (raw === null) return {};
  const value: unknown = JSON.parse(raw);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.words)) {
    throw new Error('复习记录版本或格式无效，原始记录已保留。');
  }
  const result: ReviewProgress = {};
  for (const [id, word] of Object.entries(value.words)) {
    if (!/^[1-9]\d*$/.test(id) || !Number.isSafeInteger(Number(id)) || !isRecord(word)) {
      throw new Error('复习记录包含无效词条，原始记录已保留。');
    }
    result[id] = { meaning: parseSkill(word.meaning), spelling: parseSkill(word.spelling) };
  }
  return result;
}

export function serializeReviewProgress(progress: ReviewProgress): string {
  const raw = JSON.stringify({ version: 1, words: progress });
  // Validate before persistence too; storage must always be reloadable.
  parseReviewProgress(raw);
  return raw;
}

export function summarizeAbility(session: ReviewSession, wordId: number, ability: Ability): string {
  const relevant = session.answers.filter(answer => answer.question.wordId === wordId && answer.question.ability === ability);
  if (relevant.length === 0) {
    const practicedOther = session.answers.some(answer => answer.question.wordId === wordId);
    if (practicedOther) return ability === 'meaning' ? '本轮侧重拼写，词义留待后续复习' : '本轮侧重词义，拼写留待后续复习';
    return ability === 'meaning' ? '词义尚未练习' : '拼写尚未练习';
  }
  const latest = relevant[relevant.length - 1];
  if (latest.outcome !== 'independent') {
    if (latest.outcome === 'assisted') return ability === 'meaning' ? '借助提示辨认词义，下次继续复习' : '借助提示完成拼写，下次继续复习';
    return ability === 'meaning' ? '已看答案，词义仍待巩固' : '已看答案，拼写仍待巩固';
  }
  if (relevant.some(answer => answer.outcome !== 'independent')) return ability === 'meaning' ? '词义本轮已纠正，下次继续确认' : '拼写本轮已纠正，下次继续确认';
  const evidence = relevant.find(answer => !answer.question.retry && !answer.question.exposed);
  if (!evidence) return ability === 'meaning' ? '本轮练习后能辨认词义，下次再确认' : '本轮看过该词后完成拼写，下次再确认';
  if (ability === 'meaning') return '词义能独立辨认';
  return evidence.question.level === 3 ? '完整拼写能独立完成' : '能按题目提示完成拼写，待减少提示';
}
