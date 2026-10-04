import type { MouseEvent } from 'react';
import type { DailyPhrase } from './dailyCourse';
import Icon from './Icon';

export interface WordStudyInfo { phonetic?: string; usage: string; contrast?: string }

export default function CourseWordCards({ targets, phrases, meaning, info, play, speaking }: {
  targets: DailyPhrase[];
  phrases: DailyPhrase[];
  meaning?: (id: string) => string | undefined;
  info?: (id: string) => WordStudyInfo | undefined;
  play: (phrase: DailyPhrase, slow?: boolean) => void;
  speaking: string;
}) {
  // A click on a slow control or example must never also play the card's word.
  const click = (event: MouseEvent, phrase: DailyPhrase, slow = false) => {
    event.stopPropagation();
    if (event.currentTarget instanceof HTMLButtonElement || !window.getSelection()?.toString()) play(phrase, slow);
  };
  const slowButton = (phrase: DailyPhrase) => <button type="button" className={`daily-inline-slow${speaking === `daily-${phrase.id}-slow` ? ' playing' : ''}`}
    aria-label={`慢速朗读 ${phrase.en}`} aria-pressed={speaking === `daily-${phrase.id}-slow`} onClick={event => click(event, phrase, true)}>慢速</button>;

  return <div className="course-word-grid" aria-label="本节词语学习卡片">{targets.map(word => {
    const details = info?.(word.id);
    const example = phrases.find(phrase => phrase.id === word.id.replace(/^word-/, 'example-'));
    const wordPlaying = speaking.startsWith(`daily-${word.id}-`);
    const examplePlaying = !!example && speaking.startsWith(`daily-${example.id}-`);
    return <article key={word.id} data-target-id={word.id} className={`course-word-card${wordPlaying ? ' word-playing' : ''}${examplePlaying ? ' example-playing' : ''}`}
      aria-label={`${word.en} 词语与例句`} onClick={event => click(event, word)}>
      <button type="button" className={`course-word-main${wordPlaying ? ' playing' : ''}`} aria-label={`朗读 ${word.en}`}
        aria-pressed={speaking === `daily-${word.id}-normal`} onClick={event => click(event, word)}>
        <span className="course-word-meaning" lang="zh-CN">{meaning?.(word.id) ?? word.zh}</span>
        <span className="course-word-english" lang="en"><strong>{word.en}</strong><Icon name="sound" /></span>
      </button>
      <div className="course-word-pronunciation">
        {details?.phonetic && <span className="course-word-phonetic" lang="en">/{details.phonetic}/</span>}
        {slowButton(word)}<span className="course-word-status" role="status">{wordPlaying ? '正在朗读' : ''}</span>
      </div>
      {example && <section className={`course-word-example${examplePlaying ? ' playing' : ''}`} aria-label={`${word.en} 的例句`} onClick={event => click(event, example)}>
        <button type="button" className="course-word-example-content" aria-label={`朗读 ${example.en}`}
          aria-pressed={speaking === `daily-${example.id}-normal`} onClick={event => click(event, example)}>
          <span className="course-word-example-meaning" lang="zh-CN">{example.zh}</span>
          <span className="course-word-example-english" lang="en">{example.en}<Icon name="sound" /></span>
        </button>
        <div className="course-word-example-actions">{slowButton(example)}<span className="course-word-status" role="status">{examplePlaying ? '正在朗读例句' : ''}</span></div>
      </section>}
    </article>;
  })}</div>;
}
