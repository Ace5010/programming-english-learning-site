import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import './library.css';

interface Props {
  word: string;
  meaning: string;
  playLabel?: string;
  playing: boolean;
  slowPlaying: boolean;
  play: (slow: boolean) => void;
  children: ReactNode | ((close: () => void) => ReactNode);
}

export default function LibraryCard({ word, meaning, playLabel = '朗读', playing, slowPlaying, play, children }: Props) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current!;
    const trigger = openRef.current;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [open]);

  return <>
    <article className={`library-card${playing || slowPlaying ? ' playing' : ''}`} onClick={event => {
      if ((event.target as HTMLElement).closest('button') || !window.getSelection()?.isCollapsed) return;
      play(false);
    }}>
      <button ref={openRef} type="button" className="library-card-open" aria-label={`查看 ${word} 详情`} aria-haspopup="dialog" onClick={() => setOpen(true)}>
        <span className="library-card-meaning" lang="zh-CN">{meaning}</span><Icon name="chevron" />
      </button>
      <div className="library-card-reading">
        <button type="button" className={`library-card-word${playing ? ' playing' : ''}`} aria-label={`${playLabel} ${word}`} aria-pressed={playing} onClick={() => play(false)}>
          <strong lang="en">{word}</strong><Icon name="sound" />
        </button>
        <button type="button" className={`slow-button${slowPlaying ? ' playing' : ''}`} aria-label={`慢速${playLabel} ${word}`} aria-pressed={slowPlaying} onClick={() => play(true)}>慢速</button>
      </div>
    </article>
    {open && createPortal(<dialog ref={dialogRef} className="library-dialog" aria-label={`${word} 详情`} onCancel={() => setOpen(false)} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) setOpen(false);
    }}>
      <button type="button" className="library-dialog-close" aria-label="关闭详情" onClick={() => setOpen(false)} autoFocus><Icon name="close" /></button>
      {typeof children === 'function' ? children(() => setOpen(false)) : children}
    </dialog>, document.body)}
  </>;
}
