import type { ReactNode } from 'react';
import Icon from './Icon';
import type { VocabularyItem } from './vocabulary';
import type { PlaybackSpeed } from './SpeechControls';

interface Props {
  item: VocabularyItem;
  favorite: boolean;
  favoriteDisabled: boolean;
  speaking: string;
  speed: PlaybackSpeed;
  status: ReactNode;
  action?: ReactNode;
  toggleFavorite: (id: number) => void;
  playWord: (item: VocabularyItem, slow?: boolean, key?: string) => void;
  playExample: (item: VocabularyItem, slow?: boolean, key?: string) => void;
}

export default function VocabularyRow({ item, favorite, favoriteDisabled, speaking, speed, status, action, toggleFavorite, playWord, playExample }: Props) {
  const wordPlaying = speaking === `word-${item.id}` || speaking === `slow-${item.id}`;
  const examplePlaying = speaking === `example-${item.id}` || speaking === `example-slow-${item.id}`;
  return <article data-word-id={item.id} className={`word-card${wordPlaying ? ' word-playing' : ''}${examplePlaying ? ' example-playing' : ''}`} onClick={event => {
    if ((event.target as HTMLElement).closest('button, a, input, select, summary, details') || window.getSelection()?.isCollapsed === false) return;
    playWord(item, false);
  }}>
    <div className="word-row"><button className={`word-button${wordPlaying && speed === 'normal' ? ' playing' : ''}`} onClick={() => playWord(item, false)} aria-label={`朗读单词 ${item.word}`} title="正常播放" aria-pressed={wordPlaying && speed === 'normal'}><span className="word-title"><strong lang="en">{item.word}</strong><Icon name="sound" /></span></button><div className="word-pronunciation">{item.phonetic && <span className="phonetic">/{item.phonetic}/</span>}<button type="button" className={`slow-button${wordPlaying && speed === 'slow' ? ' playing' : ''}`} onClick={() => playWord(item, true, `slow-${item.id}`)} aria-label={`慢速朗读单词 ${item.word}`} aria-pressed={wordPlaying && speed === 'slow'}>慢速</button></div></div>
    <div className="word-definition"><p className="meaning">{item.meaning}</p><p className="word-meta">{item.category}<span>·</span>{item.tier}</p></div>
    <div className="card-actions"><button className={`favorite${favorite ? ' active' : ''}`} disabled={favoriteDisabled} onClick={() => toggleFavorite(item.id)} aria-label={`${favorite ? '取消收藏' : '收藏'} ${item.word}`} title={favorite ? '取消收藏' : '收藏'} aria-pressed={favorite}><Icon name="star" /></button><span className="word-learning-status">{status}</span>{action}</div>
    <div className="example inline-example"><button className={examplePlaying && speed === 'normal' ? 'playing' : ''} onClick={() => playExample(item, false)} aria-label={`朗读例句 ${item.example}`} title="正常播放" aria-pressed={examplePlaying && speed === 'normal'}><span className="example-en" lang="en">{item.example}</span><span className="example-zh">{item.exampleZh}</span><Icon name="sound" /></button><button type="button" className={`slow-button${examplePlaying && speed === 'slow' ? ' playing' : ''}`} onClick={() => playExample(item, true, `example-slow-${item.id}`)} aria-label={`慢速朗读例句 ${item.example}`} aria-pressed={examplePlaying && speed === 'slow'}>慢速</button></div>
  </article>;
}
