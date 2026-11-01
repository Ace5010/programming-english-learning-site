import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';
import SyncPanel from './SyncPanel';
import { themes, type Theme } from './ThemePicker';
import type { PlaybackSpeed } from './SpeechControls';
import { getSyncStatus, subscribeSync } from './syncClient';
import { blockSyncApply } from './progressStorage';

type Page = 'overview' | 'audio' | 'appearance' | 'data' | 'sync' | 'export';
const labels: Record<Page, string> = { overview: '设置', audio: '声音', appearance: '外观', data: '学习数据', sync: '设备同步', export: '导出学习记录' };
const categories = [
  { page: 'audio', icon: 'sound' }, { page: 'appearance', icon: 'palette' }, { page: 'data', icon: 'database' },
] as const;
interface Props {
  theme: Theme;
  onThemeChange: (value: Theme) => void;
  voice: 'aria' | 'guy';
  onVoiceChange: (value: 'aria' | 'guy') => void;
  speed: PlaybackSpeed;
  onSpeedChange: (value: PlaybackSpeed) => void;
  feedbackEnabled: boolean;
  onFeedbackChange: (value: boolean) => void;
  speaking: string;
  preview: (slow: boolean) => void;
  stopAudio: () => void;
  exportProgramming: () => void;
  exportDaily: () => void;
  onClose: () => void;
}

export default function SettingsDialog({ theme, onThemeChange, voice, onVoiceChange, speed, onSpeedChange, feedbackEnabled, onFeedbackChange, speaking, preview, stopAudio, exportProgramming, exportDaily, onClose }: Props) {
  const [page, setPage] = useState<Page>(() => window.matchMedia('(max-width: 680px)').matches ? 'overview' : 'audio');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const pageRef = useRef(page); pageRef.current = page;
  const headingId = useId();
  const status = useSyncExternalStore(subscribeSync, getSyncStatus);
  const category = page === 'overview' ? null : page === 'sync' || page === 'export' ? 'data' : page;
  const summaries = { audio: `${voice === 'aria' ? '美式女声' : '美式男声'} · ${speed === 'slow' ? '慢速' : '正常'}`, appearance: themes.find(item => item.value === theme)!.label, data: status.message };

  useEffect(() => {
    blockSyncApply('settings', page !== 'sync');
    return () => blockSyncApply('settings', false);
  }, [page]);

  useEffect(() => {
    const dialog = dialogRef.current!;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    const media = window.matchMedia('(max-width: 680px)');
    const resize = () => { if (!media.matches && pageRef.current === 'overview') setPage('audio'); };
    media.addEventListener('change', resize);
    return () => {
      media.removeEventListener('change', resize);
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, []);

  function navigate(next: Page) {
    stopAudio();
    setPage(next);
    contentRef.current?.scrollTo({ top: 0 });
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 680px)').matches) {
        if (next === 'overview') dialogRef.current?.querySelector<HTMLButtonElement>(`[data-settings-category="${category}"]`)?.focus();
        else headingRef.current?.focus({ preventScroll: true });
      }
    });
  }
  const back = () => navigate(page === 'sync' || page === 'export' ? 'data' : 'overview');

  return createPortal(<dialog ref={dialogRef} className="settings-dialog" aria-labelledby={headingId} data-page={page}
    onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) onClose();
    }}
    onKeyDown={event => {
      // The review behind this dialog has its own Escape, Tab and Enter handlers.
      event.stopPropagation();
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      if (event.key === 'Escape') { event.preventDefault(); onClose(); }
      if (event.key !== 'Tab') return;
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href]')].filter(element => element.getClientRects().length > 0);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement as HTMLElement))) { event.preventDefault(); first?.focus(); }
    }}>
    <header className="settings-heading">
      {page !== 'overview' && <button type="button" className="settings-icon-button settings-mobile-back" aria-label={page === 'sync' || page === 'export' ? '返回学习数据' : '返回设置分类'} onClick={back}><Icon name="arrow" className="settings-back-icon" /></button>}
      <h2 ref={headingRef} id={headingId} tabIndex={-1}><span className="settings-desktop-title">设置</span><span className="settings-mobile-title">{labels[page]}</span></h2>
      <button type="button" className="settings-icon-button settings-close" aria-label="关闭设置" onClick={onClose} autoFocus><Icon name="close" /></button>
    </header>
    <div className="settings-body">
      <nav className="settings-categories" aria-label="设置分类">{categories.map(item => <button type="button" key={item.page} data-settings-category={item.page} aria-pressed={category === item.page} onClick={() => navigate(item.page)}>
        <Icon name={item.icon} /><span className="settings-category-copy"><span>{labels[item.page]}</span><span className="settings-category-summary">{summaries[item.page]}</span></span><Icon name="chevron" className="settings-category-arrow" />
        {item.page === 'data' && (status.state === 'error' || status.state === 'conflict') && <span className="settings-attention" aria-label="同步需要处理">!</span>}
      </button>)}</nav>
      <div ref={contentRef} className="settings-content" hidden={page === 'overview'}>
        <div className="settings-section-heading">
          {(page === 'sync' || page === 'export') && <button type="button" className="settings-icon-button" aria-label="返回学习数据" onClick={back}><Icon name="arrow" className="settings-back-icon" /></button>}
          <h3>{labels[page]}</h3>
        </div>
        {page === 'audio' && <>
          <label className="settings-row"><span>点读声音</span><select aria-label="点读声音" value={voice} onChange={event => onVoiceChange(event.target.value === 'guy' ? 'guy' : 'aria')}><option value="aria">美式女声 · Aria</option><option value="guy">美式男声 · Guy</option></select></label>
          <div className="settings-preview"><button type="button" className={`daily-button${speaking === 'voice-test' ? ' playing' : ''}`} aria-pressed={speaking === 'voice-test'} onClick={() => preview(false)}><Icon name="sound" />正常试听</button><button type="button" className={`daily-button${speaking === 'voice-test-slow' ? ' playing' : ''}`} aria-pressed={speaking === 'voice-test-slow'} onClick={() => preview(true)}><Icon name="sound" />慢速试听</button></div>
          <label className="settings-row"><span>自动播放语速</span><select aria-label="自动播放语速" value={speed} onChange={event => onSpeedChange(event.target.value === 'slow' ? 'slow' : 'normal')}><option value="normal">正常</option><option value="slow">慢速</option></select></label>
          <label className="settings-row settings-switch-row"><span>练习提示音</span><input className="settings-switch" type="checkbox" role="switch" checked={feedbackEnabled} onChange={event => onFeedbackChange(event.target.checked)} /></label>
        </>}
        {page === 'appearance' && <div className="settings-palettes" role="group" aria-label="界面配色">{themes.map(item => <button type="button" key={item.value} aria-pressed={theme === item.value} onClick={() => onThemeChange(item.value)}><span className={`settings-palette-sample settings-palette-${item.value}`} aria-hidden="true" /><span>{item.label}</span>{theme === item.value && <Icon name="check" />}</button>)}</div>}
        {page === 'data' && <>
          <button type="button" className="settings-link-row" onClick={() => navigate('sync')}><span><span>设备同步</span><span className={`settings-row-status sync-${status.state}`}>{status.message}</span></span><Icon name="chevron" className="settings-chevron" /></button>
          <button type="button" className="settings-link-row" onClick={() => navigate('export')}><span>导出学习记录</span><Icon name="chevron" className="settings-chevron" /></button>
        </>}
        {page === 'sync' && <SyncPanel />}
        {page === 'export' && <>
          <button type="button" className="settings-link-row" onClick={exportProgramming}><span>导出编程英语记录</span><Icon name="download" /></button>
          <button type="button" className="settings-link-row" onClick={exportDaily}><span>导出日常英语记录</span><Icon name="download" /></button>
        </>}
      </div>
    </div>
  </dialog>, document.body);
}
