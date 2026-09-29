import { createContext, Fragment, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { findReadingAudio, readingPlaybackKey } from './readingAudio';
import { readingWords, spokenEnglish } from './readingText';
import './readAloud.css';

type BeforeRead = () => void;
type Reading = { speaking: string; preload?: (text: string) => void; play: (text: string, slow?: boolean, before?: BeforeRead) => void; word: (text: string, element: HTMLElement, before?: BeforeRead) => void };
const Context = createContext<Reading>({ speaking: '', play: () => {}, word: () => {} });
export const useReading = () => useContext(Context);
function popupPosition(element: HTMLElement) {
  const box = element.getBoundingClientRect();
  return { left: Math.max(8, Math.min(box.left, window.innerWidth - 92)), top: box.bottom + 60 > window.innerHeight ? Math.max(8, box.top - 56) : box.bottom + 6 };
}

export function ReadAloudProvider({ speaking, play, preload, pageKey, children }: { speaking: string; play: (text: string, slow: boolean) => void; preload?: (text: string) => void; pageKey: string; children: ReactNode }) {
  const [active, setActive] = useState<{ text: string; element: HTMLElement; before?: BeforeRead; left: number; top: number }>();
  const popup = useRef<HTMLSpanElement>(null);
  useEffect(() => { setActive(undefined); }, [pageKey]);
  useEffect(() => { if (active && !active.element.isConnected) setActive(undefined); });
  useEffect(() => {
    if (!active) return;
    const dismiss = (event: Event) => { if (!active.element.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) setActive(undefined); };
    const move = () => {
      if (!active.element.isConnected) { setActive(undefined); return; }
      const position = popupPosition(active.element);
      if (position.left !== active.left || position.top !== active.top) setActive({ ...active, ...position });
    };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setActive(undefined); active.element.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', key, true);
    window.addEventListener('scroll', move, true);
    window.addEventListener('resize', move);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', key, true); window.removeEventListener('scroll', move, true); window.removeEventListener('resize', move); };
  }, [active]);
  const read = (text: string, slow = false, before?: BeforeRead) => {
    if (!findReadingAudio(text)) return;
    before?.(); play(text, slow);
  };
  const word = (text: string, element: HTMLElement, before?: BeforeRead) => {
    setActive({ text, element, before, ...popupPosition(element) });
    read(text, false, before);
  };
  return <Context.Provider value={{ speaking, play: read, word, preload }}>{children}{active && active.element.isConnected && createPortal(
    <span ref={popup} className="reading-popup" role="group" aria-label={`${active.text} 发音`} style={{ left: active.left, top: active.top }}>
      <button type="button" aria-label={`慢速朗读单词 ${active.text}`} className={speaking === readingPlaybackKey(active.text, true) ? 'playing' : ''} onClick={() => read(active.text, true, active.before)}>慢速</button>
    </span>, document.body)}</Context.Provider>;
}

/** In an existing answer button, use spans: no nested buttons or competing selection. */
export default function ReadAloudText({ text, inButton = false, beforeRead }: { text: string; inButton?: boolean; beforeRead?: BeforeRead }) {
  const reading = useReading();
  const words = readingWords(text);
  return <span className="reading-text">{words.map((word, index) => <Fragment key={`${index}-${word.text}`}>
    {text.slice(index ? words[index - 1].index + words[index - 1].text.length : 0, word.index)}
    {!findReadingAudio(word.text) ? word.text : inButton ? <span className="reading-button-word" data-reading-word={word.text}>{word.text}</span> : <button
      type="button" className={`reading-word${reading.speaking === readingPlaybackKey(word.text) || reading.speaking === readingPlaybackKey(word.text, true) ? ' playing' : ''}`}
      aria-label={`朗读单词 ${word.text}`} data-reading-word={word.text}
      onClick={event => { event.stopPropagation(); reading.word(word.text, event.currentTarget, beforeRead); }}>{word.text}</button>}
  </Fragment>)}{words.length ? text.slice(words[words.length - 1].index + words[words.length - 1].text.length) : text}</span>;
}

export function ReadingControls({ text, beforeRead }: { text: string; beforeRead?: BeforeRead }) {
  const reading = useReading();
  const element = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!element.current || !reading.preload) return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { reading.preload?.(text); observer.disconnect(); }
    });
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [text, reading.preload]);
  if (!findReadingAudio(text)) return null;
  const label = spokenEnglish(text);
  return <span ref={element} className="reading-controls" role="group" aria-label={`${label} 点读`}>
    <button type="button" className={reading.speaking === readingPlaybackKey(text, true) ? 'playing' : ''} aria-label={`慢速朗读 ${label}`} onClick={() => reading.play(text, true, beforeRead)}>慢速</button>
  </span>;
}

export function clickedReadingText(target: EventTarget, fallback: string) {
  return target instanceof Element ? target.closest<HTMLElement>('[data-reading-word]')?.dataset.readingWord ?? fallback : fallback;
}
