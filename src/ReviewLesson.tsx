import { useEffect, useRef, useState } from 'react';
import type { VocabularyItem } from './vocabulary';
import LessonExercise, { type ExerciseHandle } from './LessonExercise';
import { createLesson, answerLesson, nextLesson, summarizeLesson, type LessonTask, type TaskResult } from './lesson';
import { REVIEW_KEY, parseReviewProgress, serializeReviewProgress, updateReviewProgress, type ReviewProgress } from './review';
import './lesson.css';
import ThemePicker, { type Theme } from './ThemePicker';

const legacyKey = 'codewords-quiz-last-tested';
function readLegacyHistory(): Record<string, number> {
  const value: unknown = JSON.parse(localStorage.getItem(legacyKey) ?? '{}');
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid history');
  return Object.fromEntries(Object.entries(value).filter(([id, time]) => /^\d+$/.test(id) && typeof time === 'number' && Number.isFinite(time) && time > 0));
}
function loadReview() {
  let progress: ReviewProgress = {};
  let history: Record<string, number> = {};
  let warning = '';
  try { progress = parseReviewProgress(localStorage.getItem(REVIEW_KEY)); }
  catch { warning = '暂时无法读取复习记录。可以继续练习，原记录保留，本轮结果暂不保存。'; }
  try { history = readLegacyHistory(); }
  catch { warning ||= '暂时无法读取历史记录。可以继续练习，原记录保留，本轮结果暂不保存。'; }
  return { progress, history, warning };
}
function taskTitle(task: LessonTask) {
  if (task.kind === 'pairs') return '配对单词和含义';
  if (task.kind === 'listen') return '选择你听到的单词';
  if (task.kind === 'dictation') return task.difficulty === 3 ? '写出你听到的单词' : '听音补全单词';
  if (task.kind === 'cloze') return '选择合适的单词填空';
  return '选择正确的含义';
}
type Feedback = { correct: boolean; message: string; answer: string };
type Props = {
  pool: VocabularyItem[]; onClose: () => void; onFinished: () => void;
  playWord: (item: VocabularyItem, slow?: boolean, key?: string) => void;
  playExample: (item: VocabularyItem) => void;
  speaking?: string;
  theme: Theme;
  onThemeChange: (value: Theme) => void;
};

export default function ReviewLesson({ pool, onClose, onFinished, playWord, speaking = '', theme, onThemeChange }: Props) {
  const [initial] = useState(loadReview);
  const progress = useRef(initial.progress);
  const legacy = useRef(initial.history);
  const canSave = useRef(!initial.warning);
  const [warning, setWarning] = useState(initial.warning);
  const [lesson, setLesson] = useState(() => createLesson(pool, initial.progress, initial.history));
  const [ready, setReady] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const exercise = useRef<ExerciseHandle>(null);
  const completed = useRef(false);
  const observed = useRef(new Set<number>());
  const counted = useRef(new Set<string>());
  const autoPlayed = useRef('');
  const dialog = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const nextButton = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const task = lesson.tasks[lesson.index];
  const difficult = lesson.items.filter(word => lesson.results.some(result => result.answers.some(answer => answer.wordId === word.id && answer.outcome !== 'independent')));

  useEffect(() => {
    const returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const focusable = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]') ?? []);
      const first = focusable[0]; const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !focusable.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; document.removeEventListener('keydown', onKeyDown); returnFocus?.focus(); };
  }, []);

  useEffect(() => {
    dialog.current?.querySelector('.lesson-stage')?.scrollTo({ top: 0 });
    const input = dialog.current?.querySelector<HTMLInputElement>('input:not([disabled])');
    if (input) input.focus(); else heading.current?.focus();
    if (task && (task.kind === 'listen' || task.kind === 'dictation') && autoPlayed.current !== task.id) {
      autoPlayed.current = task.id;
      playWord(task.words[0], false, `lesson-${task.id}`);
    }
  }, [lesson.id, lesson.index, lesson.finished]);
  useEffect(() => { if (feedback) nextButton.current?.focus(); }, [feedback]);

  function persistAnswers(answers: TaskResult[], finishedAnswer: boolean) {
    if (!task || lesson.finished) return;
    const now = Date.now();
    let snapshot = progress.current;
    if (canSave.current) {
      try { snapshot = parseReviewProgress(localStorage.getItem(REVIEW_KEY)); }
      catch { canSave.current = false; setWarning('暂时无法读取复习记录。原记录保留，本轮后续结果暂不保存。'); }
    }
    for (const answer of answers) {
      const evidence = task.evidence.find(question => question.wordId === answer.wordId);
      if (!evidence) continue;
      snapshot = updateReviewProgress(snapshot, evidence, answer.outcome, now);
      if (finishedAnswer) legacy.current = { ...legacy.current, [answer.wordId]: now };
    }
    progress.current = snapshot;
    if (canSave.current) {
      try {
        const history = readLegacyHistory();
        localStorage.setItem(REVIEW_KEY, serializeReviewProgress(snapshot));
        if (finishedAnswer) {
          for (const answer of answers) history[answer.wordId] = now;
          localStorage.setItem(legacyKey, JSON.stringify(history));
        }
      } catch { canSave.current = false; setWarning('浏览器未能完整保存结果。可以继续练习，本轮后续结果暂不保存。'); }
    }
  }
  function observeDifficulty(wordId: number) {
    if (observed.current.has(wordId) || completed.current) return;
    observed.current.add(wordId);
    persistAnswers([{ wordId, outcome: 'assisted' }], false);
  }
  function complete(answers: TaskResult[], result: Feedback) {
    if (completed.current || lesson.finished) return;
    completed.current = true;
    persistAnswers(answers, true);
    setLesson(answerLesson(lesson, answers));
    setFeedback(result);
  }
  function resetTask() { completed.current = false; observed.current.clear(); setReady(false); setFeedback(null); }
  function next() {
    if (!feedback) return;
    const updated = nextLesson(lesson);
    setLesson(updated); resetTask();
    if (updated.finished && !counted.current.has(updated.id)) { counted.current.add(updated.id); onFinished(); }
  }
  function restart() { setLesson(createLesson(difficult.length ? difficult : pool, progress.current, legacy.current)); resetTask(); }

  const done = lesson.finished && lesson.items.length > 0;
  const empty = lesson.items.length === 0;
  return <div ref={dialog} className="lesson-overlay" role="dialog" aria-modal="true" aria-labelledby="lesson-heading" onKeyDown={event => {
    if (event.defaultPrevented || event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229 || event.target instanceof HTMLButtonElement || event.target instanceof HTMLSelectElement) return;
    event.preventDefault(); if (feedback) next(); else if (ready) exercise.current?.check();
  }}>
    <header className="lesson-header"><div className="lesson-header-inner">
      <button className="lesson-close" onClick={onClose} aria-label="退出复习"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6" /></svg><span>返回学习</span></button>
      <div className="lesson-context"><strong>词汇复习</strong>{!empty && <span>本轮 {lesson.items.length} 个词</span>}</div>
      <div className="lesson-progress-group"><div className="lesson-progress" role="progressbar" aria-label="本轮练习进度" aria-valuemin={0} aria-valuemax={lesson.tasks.length || 1} aria-valuenow={lesson.results.length}><span style={{ width: `${lesson.tasks.length ? lesson.results.length / lesson.tasks.length * 100 : 0}%` }} /></div>
        <span className="lesson-count">{done ? '完成' : empty ? '复习' : `${lesson.index + 1} / ${lesson.tasks.length}`}</span></div>
      <ThemePicker className="lesson-theme-picker" value={theme} onChange={onThemeChange} />
    </div></header>
    <main className="lesson-stage"><div key={done ? 'summary' : empty ? 'empty' : task?.id} className={`lesson-content${done ? ' lesson-summary' : ''}`}>
      {warning && <p className="lesson-storage-note" role="alert">{warning}</p>}
      {empty ? <><h1 id="lesson-heading" ref={heading} tabIndex={-1}>先学习一个词</h1><p className="lesson-empty-copy">把学过的词标记为“已掌握”，就可以开始配对、听写和选词填空。</p></> : done ? <>
        <p className="lesson-kicker">本轮记录</p><h1 id="lesson-heading" ref={heading} tabIndex={-1}>复习了 {lesson.items.length} 个词</h1>
        <p className="lesson-summary-intro">{difficult.length ? `${difficult.length} 个词还需要再练，之后会优先复习。` : '下次继续回忆这些词，再逐渐减少提示。'}</p>
        <ul className="lesson-summary-list">{lesson.items.map(word => {
          const summary = summarizeLesson(lesson, word.id);
          return <li key={word.id}><div className="lesson-summary-word"><strong>{word.word}</strong><span>{word.meaning}</span><button className={speaking === `lesson-summary-${word.id}` ? 'lesson-is-playing' : ''} onClick={() => playWord(word, undefined, `lesson-summary-${word.id}`)} aria-label={`听 ${word.word} 的发音`}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></svg></button></div><div className="lesson-summary-evidence"><p>{summary.meaning}</p><p>{summary.spelling}</p></div></li>;
        })}</ul><p className="lesson-save-note">{canSave.current ? '记录已保存在当前浏览器。' : '本轮记录未完整保存。'}</p>
      </> : task && <>
        <div className="lesson-question-header">{task.retry && <p className="lesson-kicker">再练一次</p>}<h1 id="lesson-heading" ref={heading} tabIndex={-1}>{taskTitle(task)}</h1></div>
        <LessonExercise key={task.id} ref={exercise} task={task} onReady={setReady} onResult={complete} onDifficulty={observeDifficulty} playWord={playWord} speaking={speaking} />
      </>}
    </div></main>
    <footer className={`lesson-footer${feedback ? feedback.correct ? ' lesson-footer-correct' : ' lesson-footer-correction' : ''}`}><div className="lesson-footer-inner">
      {empty ? <><span /><button className="lesson-primary" onClick={onClose}>返回学习</button></> : done ? <>
        <button className="lesson-secondary" onClick={onClose}>返回学习</button><button className="lesson-primary" onClick={restart}>{difficult.length ? '再练需要巩固的词' : '再复习一组'}</button>
      </> : feedback ? <>
        <div className="lesson-feedback" role="status"><span className="lesson-feedback-icon" aria-hidden="true"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{feedback.correct ? <path d="m5 12 4 4L19 6" /> : <><path d="M12 7v6" /><circle cx="12" cy="17" r=".8" fill="currentColor" stroke="none" /></>}</svg></span><div className="lesson-feedback-copy"><strong>{feedback.correct ? '正确' : '正确答案'}</strong>{!feedback.correct && <>{feedback.answer && <p className="lesson-answer">{feedback.answer}</p>}{feedback.message && <p>{feedback.message}</p>}</>}</div></div>
        <button ref={nextButton} className="lesson-primary" onClick={next}>{lesson.index === lesson.tasks.length - 1 ? '完成复习' : '继续'}</button>
      </> : <>
        <div className="lesson-secondary-actions"><button className="lesson-secondary" onClick={() => exercise.current?.hint()}>提示</button><button className="lesson-secondary" onClick={() => exercise.current?.reveal()}>暂时不会</button></div>
        <button className="lesson-primary" onClick={() => exercise.current?.check()} disabled={!ready}>检查</button>
      </>}
    </div></footer>
  </div>;
}
