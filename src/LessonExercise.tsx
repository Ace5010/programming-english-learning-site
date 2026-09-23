import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { VocabularyItem } from './vocabulary';
import type { LessonTask, TaskResult } from './lesson';
import { normalizeSpelling, spellingCorrection, spellingFixedCharacterError } from './ReviewSpelling';
import type { PlaybackSpeed } from './SpeechControls';

export interface ExerciseHandle {
  check(): void;
  hint(): void;
  reveal(): void;
}

export interface LessonExerciseProps {
  task: LessonTask;
  onReady: (ready: boolean) => void;
  onResult: (answers: TaskResult[], feedback: { correct: boolean; message: string; answer: string }) => void;
  onDifficulty: (wordId: number) => void;
  playWord: (item: VocabularyItem, slow?: boolean, key?: string) => void;
  speaking?: string;
  speed?: PlaybackSpeed;
  onSpeedChange?: (value: PlaybackSpeed) => void;
}

export function uniqueLessonWords(items: VocabularyItem[]) {
  return [...new Map(items.map(item => [item.id, item])).values()];
}

export function lessonShuffle(items: VocabularyItem[], seedText: string) {
  const shuffled = uniqueLessonWords(items);
  let seed = [...seedText].reduce((value, character) => Math.imul(value, 31) + character.charCodeAt(0), 17) >>> 0;
  for (let index = shuffled.length - 1; index > 0; index--) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const other = seed % (index + 1);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

/** The returned indexes count letters, leaving punctuation and digits fixed. */
export function dictationHiddenPositions(word: string, level: 0 | 1 | 2 | 3) {
  const count = normalizeSpelling(word).length;
  if (!count) return [];
  if (level === 3) return Array.from({ length: count }, (_, index) => index);
  if (level === 2) return count === 1 ? [0] : Array.from({ length: count - 1 }, (_, index) => index + 1);
  const missing = level === 0 ? Math.min(2, Math.max(1, Math.floor(count / 5))) : Math.ceil(count / 2);
  return Array.from({ length: missing }, (_, index) => Math.floor((index + 1) * count / (missing + 1)));
}

export function briefDictationCorrection(word: string, answer: string) {
  const correction = spellingCorrection(word, answer) ?? spellingFixedCharacterError(word, answer);
  if (!correction) return null;
  if (correction.includes('数字或符号')) return '数字或符号的位置需要调整。';
  return correction.split(/[，。]/)[0] + '。';
}

export function finalizePairResults(words: VocabularyItem[], completed: TaskResult[]): TaskResult[] {
  const existing = new Map(completed.map(result => [result.wordId, result]));
  return uniqueLessonWords(words).map(word => existing.get(word.id) ?? { wordId: word.id, outcome: 'revealed' });
}

const LessonExercise = forwardRef<ExerciseHandle, LessonExerciseProps>((props, ref) =>
  <ExerciseQuestion key={props.task.id} ref={ref} {...props} />);
LessonExercise.displayName = 'LessonExercise';
export default LessonExercise;

const ExerciseQuestion = forwardRef<ExerciseHandle, LessonExerciseProps>(function ExerciseQuestion(
  { task, onReady, onResult, onDifficulty, playWord, speaking = '', speed, onSpeedChange }, ref,
) {
  const words = useMemo(() => uniqueLessonWords(task.words), [task.words]);
  const target = words[0];
  const options = useMemo(() => lessonShuffle(task.options, `${task.id}:options`), [task.options, task.id]);
  const leftWords = useMemo(() => lessonShuffle(words, `${task.id}:english`), [words, task.id]);
  const rightWords = useMemo(() => {
    const shuffled = lessonShuffle(words, `${task.id}:meaning`);
    if (shuffled.length > 1 && shuffled.every((word, index) => word.id === leftWords[index].id)) shuffled.push(shuffled.shift()!);
    return shuffled;
  }, [words, task.id, leftWords]);
  const letters = useMemo(() => [...(target?.word ?? '')].filter(character => /^[a-z]$/i.test(character)), [target?.word]);
  const hidden = useMemo(() => dictationHiddenPositions(target?.word ?? '', task.difficulty), [target?.word, task.difficulty]);
  const [selected, setSelected] = useState<number | null>(null);
  const [input, setInput] = useState('');
  const [gapAnswers, setGapAnswers] = useState<Record<number, string>>({});
  const [gapComposition, setGapComposition] = useState<{ position: number; text: string } | null>(null);
  const [hints, setHints] = useState<number[]>([]);
  const [excluded, setExcluded] = useState<number[]>([]);
  const [pairResults, setPairResults] = useState<TaskResult[]>([]);
  const [pairLeft, setPairLeft] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [done, setDone] = useState(false);
  const finished = useRef(false);
  const composing = useRef(false);
  const observed = useRef(new Set<number>());
  const pairMistakes = useRef<Record<number, number>>({});
  const pairResultsRef = useRef<TaskResult[]>([]);
  const pairLeftRef = useRef<number | null>(null);
  const gapRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const inputRef = useRef<HTMLInputElement | null>(null);
  const selectedRef = useRef<number | null>(null);
  const inputValue = useRef('');
  const gapValues = useRef<Record<number, string>>({});
  const hintedPositions = useRef<number[]>([]);
  const excludedOptions = useRef<number[]>([]);

  const dictationReady = task.difficulty === 3
    ? normalizeSpelling(input).length > 0
    : hidden.length > 0 && hidden.every(position => Boolean(gapAnswers[position]));
  const ready = !done && Boolean(target) && (task.kind === 'pairs' ? false : task.kind === 'dictation' ? dictationReady : selected !== null);
  useEffect(() => { onReady(ready); }, [onReady, ready]);

  function focusGap(position: number | undefined) {
    if (position === undefined) return;
    const input = gapRefs.current[position];
    input?.focus();
    input?.select();
  }

  function enterGap(position: number, text: string) {
    const characters = [...text.replace(/[^a-z]/gi, '')];
    const start = hidden.indexOf(position);
    const next = { ...gapValues.current };
    if (!characters.length) next[position] = '';
    else characters.slice(0, hidden.length - start).forEach((letter, index) => { next[hidden[start + index]] = letter; });
    gapValues.current = next;
    setGapAnswers(next);
    if (characters.length) focusGap(hidden[Math.min(start + characters.length, hidden.length - 1)]);
  }

  function markDifficulty(wordId: number) {
    if (finished.current || observed.current.has(wordId)) return;
    observed.current.add(wordId);
    onDifficulty(wordId);
  }

  function finish(results: TaskResult[], correct: boolean, message: string, answer: string) {
    if (finished.current) return;
    finished.current = true;
    setDone(true);
    onResult(results, { correct, message, answer });
  }

  function check() {
    if (finished.current || composing.current || !target || task.kind === 'pairs') return;
    if (task.kind === 'dictation') {
      const actual = task.difficulty === 3 ? inputValue.current : letters.map((character, index) => hidden.includes(index) ? gapValues.current[index] ?? '' : character).join('');
      if (task.difficulty === 3 ? !normalizeSpelling(actual) : hidden.some(position => !gapValues.current[position])) return;
      const correction = task.difficulty === 3
        ? briefDictationCorrection(target.word, actual)
        : briefDictationCorrection(letters.join(''), actual);
      if (correction) markDifficulty(target.id);
      const outcome: TaskResult['outcome'] = correction ? 'revealed' : observed.current.has(target.id) ? 'assisted' : 'independent';
      finish([{ wordId: target.id, outcome }], !correction, correction ?? '拼写正确。', target.word);
      return;
    }
    if (selectedRef.current === null) return;
    const correct = selectedRef.current === target.id;
    if (!correct) markDifficulty(target.id);
    finish([{ wordId: target.id, outcome: correct ? observed.current.has(target.id) ? 'assisted' : 'independent' : 'revealed' }],
      correct, correct ? '回答正确。' : task.kind === 'listen' ? '再听一次，记住这个词。' : task.kind === 'cloze' ? '这里使用这个词。' : '留意这个词的含义。',
      task.kind === 'context' ? `${target.example} — ${target.exampleZh}` : `${target.word} — ${target.meaning}`);
  }

  function finishPair(wordId: number, outcome: TaskResult['outcome']) {
    if (finished.current || pairResultsRef.current.some(result => result.wordId === wordId)) return;
    const next = [...pairResultsRef.current, { wordId, outcome }];
    pairResultsRef.current = next;
    setPairResults(next);
    pairLeftRef.current = null;
    setPairLeft(null);
    if (next.length === words.length) finish(next, next.every(result => result.outcome === 'independent'),
      '配对完成。', words.map(word => `${word.word} — ${word.meaning}`).join('；'));
  }

  function chooseMeaning(wordId: number) {
    if (finished.current || pairResultsRef.current.some(result => result.wordId === wordId)) return;
    const englishId = pairLeftRef.current;
    if (englishId === null) { setNote('先选择左侧的单词。'); return; }
    const english = words.find(word => word.id === englishId);
    if (!english) return;
    if (englishId === wordId) {
      setNote(`${english.word} — ${english.meaning}`);
      finishPair(englishId, observed.current.has(englishId) ? 'assisted' : 'independent');
      return;
    }
    markDifficulty(englishId);
    const mistakes = (pairMistakes.current[englishId] ?? 0) + 1;
    pairMistakes.current[englishId] = mistakes;
    if (mistakes >= 2) {
      setNote(`${english.word} — ${english.meaning}，已配好。`);
      finishPair(englishId, 'revealed');
    } else {
      setNote(`${english.word} 的意思是“${english.meaning}”，再选一次。`);
    }
  }

  function hint() {
    if (finished.current || !target) return;
    if (task.kind === 'pairs') {
      const word = words.find(candidate => candidate.id === pairLeftRef.current)
        ?? words.find(candidate => !pairResultsRef.current.some(result => result.wordId === candidate.id));
      if (!word) return;
      markDifficulty(word.id);
      pairLeftRef.current = word.id;
      setPairLeft(word.id);
      setNote(`${word.word} — ${word.meaning}`);
      return;
    }
    markDifficulty(target.id);
    if (task.kind === 'dictation') {
      const current = task.difficulty === 3 ? [...normalizeSpelling(inputValue.current)] : letters.map((letter, index) => hidden.includes(index) ? gapValues.current[index] ?? '' : letter);
      let position = hidden.find(index => current[index]?.toLowerCase() !== letters[index].toLowerCase() && !hintedPositions.current.includes(index));
      if (position === undefined) position = hidden.find(index => !hintedPositions.current.includes(index));
      if (position === undefined) { setNote('提示已经给出，再听一遍试试。'); onSpeedChange?.('slow'); playWord(target, true, `${task.id}:hint-audio`); return; }
      hintedPositions.current = [...hintedPositions.current, position];
      setHints(hintedPositions.current);
      setNote(`第 ${position + 1} 个字母是 ${letters[position]}。`);
      if (task.difficulty < 3) {
        const next = { ...gapValues.current, [position]: letters[position] };
        gapValues.current = next;
        setGapAnswers(next);
        const nextGap = hidden.find(index => !next[index]);
        focusGap(nextGap);
      } else inputRef.current?.focus();
      return;
    }
    const distractor = options.find(option => option.id !== target.id && !excludedOptions.current.includes(option.id));
    if (distractor) {
      excludedOptions.current = [...excludedOptions.current, distractor.id];
      setExcluded(excludedOptions.current);
      if (selectedRef.current === distractor.id) { selectedRef.current = null; setSelected(null); }
      setNote('已排除一个选项。');
    } else if (task.kind === 'listen') {
      setNote('慢速再听一次。');
      onSpeedChange?.('slow');
      playWord(target, true, `${task.id}:hint-audio`);
    } else setNote(target.exampleZh || target.meaning);
  }

  function reveal() {
    if (finished.current || !target) return;
    if (task.kind === 'pairs') {
      const results = finalizePairResults(words, pairResultsRef.current);
      for (const word of words) if (!pairResultsRef.current.some(result => result.wordId === word.id)) markDifficulty(word.id);
      pairResultsRef.current = results;
      setPairResults(results);
      finish(results, false, '一起看一下这些词。', words.map(word => `${word.word} — ${word.meaning}`).join('；'));
      return;
    }
    markDifficulty(target.id);
    finish([{ wordId: target.id, outcome: 'revealed' }], false, '记住这个词，稍后再试。', task.kind === 'context' ? `${target.example} — ${target.exampleZh}` : `${target.word} — ${target.meaning}`);
  }

  useImperativeHandle(ref, () => ({ check, hint, reveal }));

  if (!target) return <p className="lesson-empty">本题没有可练习的词。</p>;
  const wordPlaying = speaking === `${task.id}:word` || speaking === `${task.id}:slow` || speaking === `${task.id}:hint-audio` || speaking === `lesson-${task.id}`;
  const playbackSpeed = speed ?? (speaking === `${task.id}:slow` || speaking === `${task.id}:hint-audio` ? 'slow' : 'normal');
  const mainPlaying = wordPlaying && playbackSpeed === 'normal';
  const slowPlaying = wordPlaying && playbackSpeed === 'slow';
  const audio = <div className="lesson-audio">
    <button type="button" className={`lesson-audio-main${mainPlaying ? ' lesson-is-playing' : ''}`} aria-label="正常播放" aria-pressed={mainPlaying} onClick={() => { onSpeedChange?.('normal'); playWord(target, false, `${task.id}:word`); }}>
      <span className="lesson-audio-symbol" aria-hidden="true">{mainPlaying ? <span className="lesson-sound-bars"><i /><i /><i /><i /></span> : <svg width="25" height="25" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" /></svg>}</span>
      <span>正常播放</span>
    </button>
    <button type="button" className={`lesson-audio-slow${slowPlaying ? ' lesson-is-playing' : ''}`} aria-pressed={slowPlaying} onClick={() => { onSpeedChange?.('slow'); playWord(target, true, `${task.id}:slow`); }}>慢速播放</button>
  </div>;
  let position = 0;
  return <div className={`lesson-exercise lesson-exercise-${task.kind}`} onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; }}
    onKeyDownCapture={event => {
      if ((event.key === 'Enter' || event.key === 'Escape') && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) {
        if (event.key === 'Enter') event.preventDefault();
        event.stopPropagation();
      }
    }}>
    {task.kind === 'meaning' && <div className="lesson-target"><strong>{target.word}</strong>{audio}</div>}
    {(task.kind === 'listen' || task.kind === 'dictation') && audio}
    {task.kind === 'cloze' && <p className="lesson-sentence">{(task.sentence ?? '___').split(/(_{3,})/).map((part, index) => /^_{3,}$/.test(part)
      ? <span key={index} className="lesson-sentence-gap">{done ? target.word : '______'}</span> : <span key={index}>{part}</span>)}</p>}
    {task.kind === 'context' && <p className="lesson-sentence">{target.example}</p>}
    {task.kind === 'cloze' && <p className="lesson-translation">{target.exampleZh}</p>}
    {(task.kind === 'meaning' || task.kind === 'listen' || task.kind === 'cloze' || task.kind === 'context') && <div className="lesson-options" role="group" aria-label="答案选项">
      {options.map(option => <button key={option.id} type="button" className={`lesson-option${selected === option.id ? ' lesson-selected' : ''}${done && option.id === target.id ? ' lesson-correct' : ''}${done && selected === option.id && option.id !== target.id ? ' lesson-incorrect' : ''}${excluded.includes(option.id) ? ' lesson-excluded' : ''}`}
        aria-pressed={selected === option.id} disabled={done || excluded.includes(option.id)} onClick={() => { selectedRef.current = option.id; setSelected(option.id); }}>
        <span className="lesson-option-indicator" aria-hidden="true">{done && option.id === target.id ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg> : selected === option.id ? <i /> : null}</span><span>{task.kind === 'meaning' ? option.meaning : task.kind === 'context' ? option.exampleZh : option.word}</span>
      </button>)}
    </div>}
    {task.kind === 'dictation' && <div className="lesson-dictation">
      <div className="lesson-letter-slots" aria-label="拼写提示，数字和标点已给出">
        {[...target.word].map((character, index) => {
          if (!/^[a-z]$/i.test(character)) return <span key={index} className={/\s/.test(character) ? 'lesson-letter-space' : 'lesson-letter-fixed'}>{character}</span>;
          const ordinal = position++;
          if (done || !hidden.includes(ordinal) || (task.difficulty === 3 && hints.includes(ordinal))) return <span key={index} className={`lesson-letter-fixed${hints.includes(ordinal) ? ' lesson-letter-hint' : ''}`}>{character}</span>;
          if (task.difficulty === 3) return <span key={index} className="lesson-letter-blank">＿</span>;
          return <input key={index} ref={element => { gapRefs.current[ordinal] = element; }} aria-label={`第 ${ordinal + 1} 个字母`} autoFocus={ordinal === hidden[0]}
            className={`lesson-letter-input${hints.includes(ordinal) ? ' lesson-letter-hint' : ''}`} value={gapComposition?.position === ordinal ? gapComposition.text : gapAnswers[ordinal] ?? ''} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
            onFocus={event => event.currentTarget.select()}
            onCompositionStart={event => {
              composing.current = true;
              setGapComposition({ position: ordinal, text: event.currentTarget.value });
            }}
            onCompositionEnd={event => {
              composing.current = false;
              setGapComposition(null);
              enterGap(ordinal, event.currentTarget.value);
            }}
            onChange={event => {
              if (composing.current || (event.nativeEvent as InputEvent).isComposing) {
                setGapComposition({ position: ordinal, text: event.currentTarget.value });
                return;
              }
              enterGap(ordinal, event.currentTarget.value);
            }} onPaste={event => {
              if (composing.current) return;
              event.preventDefault();
              enterGap(ordinal, event.clipboardData.getData('text'));
            }} onKeyDown={event => {
              if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229 || composing.current || event.ctrlKey || event.metaKey || event.altKey) return;
              const index = hidden.indexOf(ordinal);
              if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                event.preventDefault();
                focusGap(hidden[Math.max(0, Math.min(hidden.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)))]);
              } else if (event.key === 'Backspace' || event.key === 'Delete') {
                event.preventDefault();
                const position = event.key === 'Backspace' && !gapValues.current[ordinal] ? hidden[index - 1] : ordinal;
                if (position !== undefined) { enterGap(position, ''); focusGap(position); }
              } else if (/^[a-z]$/i.test(event.key)) {
                event.preventDefault();
                enterGap(ordinal, event.key);
              } else if (event.key === 'Enter') {
                event.preventDefault();
                const missing = hidden.find(position => !gapValues.current[position]);
                if (missing !== undefined) focusGap(missing); else check();
              }
            }} />;
        })}
      </div>
      {!done && task.difficulty === 3 && <input ref={inputRef} className="lesson-dictation-input" aria-label="英文拼写" placeholder="输入听到的单词" autoFocus value={input} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        onChange={event => { inputValue.current = event.target.value; setInput(event.target.value); }}
        onKeyDown={event => { if (event.key === 'Enter' && !event.defaultPrevented && !event.nativeEvent.isComposing && event.keyCode !== 229 && !composing.current) { event.preventDefault(); check(); } }} />}
      {!done && <p className="lesson-keyboard-help">{task.difficulty === 3 ? 'Enter 检查答案，再按一次继续。' : '输入后自动跳格；← → 切换，退格修改，Enter 检查 / 继续。'}</p>}
    </div>}
    {task.kind === 'pairs' && <p className="lesson-instruction">先选一个英文单词，再选对应的中文含义。</p>}
    {task.kind === 'pairs' && <div className="lesson-pairs">
      <div className="lesson-pair-column" role="group" aria-label="英文单词">{leftWords.map(word => {
        const matched = pairResults.some(result => result.wordId === word.id);
        return <button type="button" key={word.id} disabled={done || matched} className={`lesson-pair-card${pairLeft === word.id ? ' lesson-selected' : ''}${matched ? ' lesson-matched' : ''}`}
          aria-pressed={pairLeft === word.id} onClick={() => { pairLeftRef.current = word.id; setPairLeft(word.id); setNote(''); }}>{word.word}{matched && <span className="lesson-pair-marker">已配对</span>}</button>;
      })}</div>
      <div className="lesson-pair-column" role="group" aria-label="中文含义">{rightWords.map(word => {
        const matched = pairResults.some(result => result.wordId === word.id);
        return <button type="button" key={word.id} disabled={done || matched} className={`lesson-pair-card${matched ? ' lesson-matched' : ''}`} onClick={() => chooseMeaning(word.id)}>{word.meaning}{matched && <span className="lesson-pair-marker">已配对</span>}</button>;
      })}</div>
    </div>}
    {!done && note && <p className="lesson-note" role="status">{note}</p>}
  </div>;
});
