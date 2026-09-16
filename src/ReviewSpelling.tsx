import { useMemo, useRef, useState } from 'react';
import type { VocabularyItem } from './vocabulary';

export type SpellingMode = 'gap' | 'tiles' | 'gaps' | 'type';
export type SpellingOutcome = 'independent' | 'assisted' | 'revealed';

type Props = {
  item: VocabularyItem;
  mode: SpellingMode;
  onComplete: (outcome: SpellingOutcome) => void;
  onDifficulty?: () => void;
};

const isLetter = (character: string) => /^[a-z]$/i.test(character);

// Only English letters are practiced. Fixed characters may be omitted; when
// supplied explicitly, they are checked separately against the template.
export function normalizeSpelling(value: string) {
  return value.toLowerCase().replace(/[^a-z]/g, '');
}

export function spellingFixedCharacterError(word: string, answer: string): string | null {
  const fixedByPosition = (value: string) => {
    const fixed: Record<number, string> = {};
    let position = 0;
    for (const character of value) {
      if (isLetter(character)) position++;
      else if (!/\s/.test(character)) fixed[position] = (fixed[position] ?? '') + character;
    }
    return fixed;
  };
  const expected = fixedByPosition(word);
  const supplied = fixedByPosition(answer);
  for (const [position, characters] of Object.entries(supplied)) {
    const template = expected[Number(position)] ?? '';
    let cursor = 0;
    for (const character of characters) {
      const match = template.indexOf(character, cursor);
      if (match < 0) return '字母已对上，但输入的数字或符号与模板不一致。可以省略固定字符，只输入英文字母。';
      cursor = match + 1;
    }
  }
  return null;
}

/** Positions count English letters, rather than punctuation or UTF-16 units. */
export function spellingGapPositions(word: string, mode: 'gap' | 'gaps') {
  const length = normalizeSpelling(word).length;
  if (!length) return [];
  if (mode === 'gap') return [Math.floor(length / 2)];
  const count = Math.min(4, Math.max(1, Math.floor(length / 3)));
  return Array.from({ length: count }, (_, index) => Math.floor((index + 1) * length / (count + 1)));
}

/** Diagnose the first useful correction without disclosing its replacement. */
export function spellingCorrection(word: string, answer: string): string | null {
  const expected = normalizeSpelling(word);
  const actual = normalizeSpelling(answer);
  if (expected === actual) return null;
  let first = 0;
  while (first < Math.min(expected.length, actual.length) && expected[first] === actual[first]) first++;
  if (actual.length === expected.length && first + 1 < expected.length
    && actual[first] === expected[first + 1] && actual[first + 1] === expected[first]
    && actual.slice(first + 2) === expected.slice(first + 2)) {
    return `第 ${first + 1}、${first + 2} 个字母顺序反了，试着交换它们。`;
  }
  if (actual.length === expected.length - 1 && actual.slice(first) === expected.slice(first + 1)) {
    return `第 ${first + 1} 个位置漏了一个字母，其他字母保留。`;
  }
  if (actual.length === expected.length + 1 && actual.slice(first + 1) === expected.slice(first)) {
    return `第 ${first + 1} 个位置多了一个字母，其他字母保留。`;
  }
  if (actual.length < expected.length) {
    return `还少 ${expected.length - actual.length} 个字母，请从第 ${first + 1} 个位置开始检查。`;
  }
  if (actual.length > expected.length) {
    return `多了 ${actual.length - expected.length} 个字母，请从第 ${first + 1} 个位置开始检查。`;
  }
  return `第 ${first + 1} 个字母还需要调整，先试着自己改正。`;
}

export default function ReviewSpelling(props: Props) {
  return <SpellingQuestion key={`${props.item.id}:${props.item.word}:${props.mode}`} {...props} />;
}

function SpellingQuestion({ item, mode, onComplete, onDifficulty }: Props) {
  const characters = useMemo(() => [...item.word], [item.word]);
  const letters = useMemo(() => characters.filter(isLetter), [characters]);
  const expected = letters.join('');
  const gaps = useMemo(() => spellingGapPositions(item.word, mode === 'gaps' ? 'gaps' : 'gap'), [item.word, mode]);
  const tiles = useMemo(() => {
    const shuffled = letters.map((character, id) => ({ character, id }));
    let seed = item.id + 17;
    for (let index = shuffled.length - 1; index > 0; index--) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const other = seed % (index + 1);
      [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
    }
    if (shuffled.map(({ character }) => character).join('') === expected && shuffled.length > 1) {
      shuffled.push(shuffled.shift()!);
    }
    return shuffled;
  }, [letters, item.id, expected]);
  const [useTiles, setUseTiles] = useState(mode === 'tiles');
  const [chosen, setChosen] = useState<(number | null)[]>(() => letters.map(() => null));
  const [gapAnswers, setGapAnswers] = useState<Record<number, string>>({});
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [hintedPositions, setHintedPositions] = useState<number[]>([]);
  const [message, setMessage] = useState('');
  const [outcome, setOutcome] = useState<SpellingOutcome | null>(null);
  const completed = useRef(false);
  const difficultyObserved = useRef(false);
  const composing = useRef(false);
  const inputs = useRef<Record<number, HTMLInputElement | null>>({});
  const textInput = useRef<HTMLInputElement | null>(null);

  const values = useTiles
    ? chosen.map((tile) => tile === null ? '' : letters[tile])
    : mode === 'type'
      ? [...normalizeSpelling(answer)]
      : letters.map((character, index) => gaps.includes(index) ? gapAnswers[index] ?? '' : character);
  const allFilled = useTiles || mode !== 'type'
    ? values.every((character) => character.length > 0)
    : normalizeSpelling(answer).length > 0;
  const done = outcome !== null;

  function markDifficulty() {
    if (completed.current || difficultyObserved.current) return;
    difficultyObserved.current = true;
    onDifficulty?.();
  }

  function finish(result: SpellingOutcome) {
    if (completed.current) return;
    if (result === 'revealed') markDifficulty();
    completed.current = true;
    setOutcome(result);
    onComplete(result);
  }

  function submit() {
    if (completed.current || composing.current) return;
    const empty = values.findIndex((value) => !value);
    const correction = (empty >= 0
      ? `第 ${empty + 1} 个字母还没有填写，已填好的部分保留。`
      : spellingCorrection(expected, values.join('')))
      ?? (mode === 'type' && !useTiles ? spellingFixedCharacterError(item.word, answer) : null);
    if (correction !== null) {
      markDifficulty();
      setChecked(true);
      setMessage(correction);
      const firstWrong = values.findIndex((value, index) => value.toLowerCase() !== letters[index]?.toLowerCase());
      inputs.current[firstWrong]?.focus();
      inputs.current[firstWrong]?.select();
      return;
    }
    const result = difficultyObserved.current ? 'assisted' : 'independent';
    setMessage(result === 'assisted'
      ? '已在帮助或纠错后完成，后续复习再确认。'
      : mode === 'type' && !useTiles
        ? '本次已独立输入正确拼写。'
        : useTiles ? '本次已完成字母拼接。' : '本次已完成缺字填空。');
    finish(result);
  }

  function hint() {
    if (completed.current) return;
    markDifficulty();
    let position = letters.findIndex((character, index) =>
      values[index]?.toLowerCase() !== character.toLowerCase() && !hintedPositions.includes(index));
    if (position < 0) position = letters.findIndex((_, index) => !hintedPositions.includes(index)
      && (mode === 'type' || useTiles || gaps.includes(index)));
    if (position < 0) {
      setMessage('需要的提示已经给出。可以检查答案，或查看完整答案后继续。');
      return;
    }
    setHintedPositions((previous) => [...previous, position]);
    setMessage(`第 ${position + 1} 个字母是「${letters[position]}」。对照提示，再试一次。`);
    if (useTiles) {
      // Pick any unused instance of the needed letter. If its tile is in a wrong
      // slot, move that instance; other correct slots stay exactly where they are.
      const matches = letters.flatMap((character, id) => character.toLowerCase() === letters[position].toLowerCase() ? [id] : []);
      const target = matches.find((id) => !chosen.includes(id))
        ?? matches.find((id) => {
          const slot = chosen.indexOf(id);
          return letters[slot]?.toLowerCase() !== letters[position].toLowerCase();
        })
        ?? chosen[position];
      if (target !== null && target !== undefined) setChosen(chosen.map((id, index) => index === position ? target : id === target ? null : id));
    } else if (mode !== 'type') {
      setGapAnswers((previous) => ({ ...previous, [position]: letters[position] }));
      const next = gaps.find((index) => index !== position && !gapAnswers[index]);
      if (next !== undefined) inputs.current[next]?.focus();
    } else {
      textInput.current?.focus();
    }
  }

  function switchToTiles() {
    if (completed.current) return;
    markDifficulty();
    setChecked(false);
    const used = new Set<number>();
    setChosen(letters.map((character, position) => {
      if (values[position]?.toLowerCase() !== character.toLowerCase()) return null;
      const tile = letters.findIndex((candidate, id) => !used.has(id) && candidate.toLowerCase() === character.toLowerCase());
      used.add(tile);
      return tile;
    }));
    setUseTiles(true);
    setMessage('已保留正确位置，改用字母拼接。本题会记为借助帮助完成。');
  }

  function updateGap(position: number, value: string) {
    const letter = value.replace(/[^a-z]/gi, '').slice(-1);
    setGapAnswers((previous) => ({ ...previous, [position]: letter }));
    if (letter && !composing.current) {
      const next = gaps[gaps.indexOf(position) + 1];
      if (next !== undefined) inputs.current[next]?.focus();
    }
  }

  let letterPosition = 0;
  return <form className="quiz-spelling review-spelling" onSubmit={(event) => { event.preventDefault(); submit(); }}
    onCompositionStart={() => { composing.current = true; }}
    onCompositionEnd={() => { composing.current = false; }}
    onKeyDownCapture={(event) => {
      if (event.key === 'Enter' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.preventDefault();
      if (event.key === 'Escape' && (composing.current || event.nativeEvent.isComposing || event.keyCode === 229)) event.stopPropagation();
    }}>
    <p className="quiz-prompt">{useTiles ? '按顺序放入字母，已填的字母可以点击撤回' : mode === 'type'
      ? '根据词义和发音，输入英文拼写' : `补上缺失的 ${gaps.length} 个字母`}</p>
    <div className={`spelling-slots${mode === 'type' && !useTiles ? ' review-answer-template' : ''}`} aria-label="拼写模板，空格、数字和标点已给出">
      {characters.map((character, characterIndex) => {
        if (!isLetter(character)) return <span key={characterIndex} className={/\s/.test(character) ? 'word-space' : 'spelling-fixed'}>{character}</span>;
        const position = letterPosition++;
        const current = values[position] ?? '';
        const correct = current.toLowerCase() === character.toLowerCase();
        const stateClass = done ? '' : checked ? correct ? 'is-correct' : 'is-error' : '';
        if (done) return <span key={characterIndex}>{character}</span>;
        if (useTiles) return <button key={characterIndex} type="button" className={stateClass}
          disabled={chosen[position] === null}
          aria-label={`第 ${position + 1} 格${current ? `：${current}，点击撤回` : '：待填'}`}
          onClick={() => setChosen((previous) => previous.map((tile, index) => index === position ? null : tile))}>{current || '＿'}</button>;
        if (mode === 'type') return <span key={characterIndex} className={hintedPositions.includes(position) ? 'is-hint' : stateClass}>
          {hintedPositions.includes(position) ? character : checked ? current || '＿' : '＿'}
        </span>;
        if (!gaps.includes(position)) return <span key={characterIndex}>{character}</span>;
        return <input key={characterIndex} ref={(element) => { inputs.current[position] = element; }}
          className={stateClass} aria-label={`第 ${position + 1} 个字母`} autoFocus={position === gaps[0]}
          maxLength={1} value={gapAnswers[position] ?? ''} autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
          onChange={(event) => updateGap(position, event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Backspace' && !gapAnswers[position] && !composing.current) {
              const previous = gaps[gaps.indexOf(position) - 1];
              if (previous !== undefined) inputs.current[previous]?.focus();
            }
          }} />;
      })}
    </div>
    {!done && mode === 'type' && !useTiles && <label>
      <span className="review-input-label">英文拼写</span>
      <input ref={textInput} autoFocus value={answer} aria-label="英文拼写" autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false}
        onChange={(event) => setAnswer(event.target.value)} />
    </label>}
    {!done && useTiles && <div className="letter-bank" aria-label="可选字母">
      {tiles.map(({ character, id }) => <button key={id} type="button" disabled={chosen.includes(id)}
        aria-label={`字母 ${character}，第 ${id + 1} 个字母块`} onClick={() => {
          const free = chosen.indexOf(null);
          if (free >= 0) setChosen((previous) => previous.map((tile, index) => index === free ? id : tile));
        }}>{character}</button>)}
    </div>}
    {!done && <p className="review-spelling-help">{useTiles ? '字母块只包含答案需要的字母；重复字母各有一个字母块。' : mode === 'type'
      ? '大小写、多余空格均可。模板中的数字和符号可以省略；如果输入它们，需要与模板一致。'
      : '大小写均可。只需输入英文字母，其他字符已给出。'}字母位置按英文字母计数。</p>}
    {message && <p className={done ? 'review-spelling-complete' : 'review-spelling-feedback'} role="status">{message}</p>}
    {outcome === 'revealed' && <p className="review-spelling-complete">完整拼写：<strong>{item.word}</strong>。本题记为查看答案，之后继续复习。</p>}
    {!done && <div className="modal-actions review-spelling-actions">
      <button type="submit" disabled={!allFilled || letters.length === 0}>检查答案</button>
      <button type="button" onClick={hint}>给我提示</button>
      {!useTiles && <button type="button" onClick={switchToTiles}>换成字母拼接</button>}
      <button type="button" onClick={() => { setMessage(''); finish('revealed'); }}>查看答案</button>
    </div>}
  </form>;
}
