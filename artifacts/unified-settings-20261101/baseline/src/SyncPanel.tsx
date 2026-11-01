import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { connectSync, disconnectSync, getSyncStatus, subscribeSync, syncClient, syncNow } from './syncClient';
import { SYNC_BACKUP } from './progressSync';
import { downloadRecord } from './nativeAndroid';
import Icon from './Icon';
import type { Snapshot } from './syncProtocol';

function describe(snapshot: Snapshot) {
  const rounds = (key: 'codewords-daily-v1' | 'codewords-programming-course-v1') => {
    const value = JSON.parse(snapshot[key] ?? '{}');
    return value.learning?.rounds ?? Object.values(value.lessons ?? {}).filter((lesson: unknown) => !!(lesson as { completedAt?: number }).completedAt).length;
  };
  const words = JSON.parse(snapshot['codewords-review-v1'] ?? '{"words":{}}').words;
  return `编程完成 ${rounds('codewords-programming-course-v1')} 课，日常完成 ${rounds('codewords-daily-v1')} 课，复习词 ${Object.keys(words).length} 个`;
}

export default function SyncPanel() {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus);
  const [open, setOpen] = useState(false), [code, setCode] = useState(''), [showCode, setShowCode] = useState(false), [notice, setNotice] = useState(''), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const dialog = useRef<HTMLElement>(null);
  const pending = status.state === 'syncing';
  const copies = syncClient.conflictCopies();
  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
      if (event.key !== 'Tab') return;
      const controls = [...dialog.current!.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), [tabindex="0"]')];
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', keydown);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', keydown); before?.focus(); };
  }, [open]);
  function exportBackup() {
    const raw = localStorage.getItem(SYNC_BACKUP);
    if (raw) downloadRecord('codewords-sync-backup.json', raw); else setNotice('目前没有冲突备份。');
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(syncClient.code()); setNotice('同步码已复制。'); }
    catch { setShowCode(true); setNotice('请长按或选中同步码复制。'); }
  }
  const label = !status.paired ? '同步' : status.state === 'synced' ? '已同步' : status.state === 'conflict' ? '同步冲突' : pending ? '同步中' : '待同步';
  return <>
    <button className={`sync-trigger sync-${status.state}`} aria-label={`设备同步：${status.message}`} onClick={() => { setOpen(true); setNotice(''); }}><Icon name="review" /><span>{label}</span></button>
    {open && createPortal(<div className="sync-overlay" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section ref={dialog} className="sync-dialog" role="dialog" aria-modal="true" aria-labelledby="sync-heading">
        <div className="sync-heading"><h2 id="sync-heading">手机与网页同步</h2><button aria-label="关闭同步设置" onClick={() => setOpen(false)}><Icon name="close" /></button></div>
        <p>课程、复习、已掌握词和收藏在你的设备间共享。断网时继续保存在本机。</p>
        <p className={`sync-status sync-${status.state}`} role="status">{status.message}{status.state === 'synced' && status.syncedAt > 0 ? ` · ${new Date(status.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
        {!status.paired ? <>
          <div className="sync-step"><h3>在已有进度的设备上</h3><p>开启同步后，把同步码复制到另一台设备。</p><button className="daily-button primary" onClick={() => void connectSync()} disabled={pending}>开启同步</button></div>
          <form className="sync-step" onSubmit={event => { event.preventDefault(); void connectSync(code); }}><h3>在另一台设备上</h3><label htmlFor="sync-code">输入已有同步码</label><textarea id="sync-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} rows={3} placeholder="粘贴另一台设备的同步码" /><button className="daily-button" type="submit" disabled={!code.trim() || pending}>连接已有进度</button></form>
        </> : <>
          {status.state === 'conflict' ? <div className="sync-conflict"><p>冲突部分：{status.conflicts.join('、')}。选择后会先备份两份记录，再继续同步；其他部分和收藏仍会合并。</p><div className="sync-copies">{copies && <><p><strong>本机：</strong>{describe(copies.local)}</p><p><strong>另一设备：</strong>{describe(copies.remote)}</p></>}</div><div className="sync-actions"><button className="daily-button" onClick={() => void syncNow(true, 'local')}>备份后继续本机记录</button><button className="daily-button" onClick={() => void syncNow(true, 'remote')}>备份后使用另一设备记录</button></div></div> : <button className="daily-button primary" disabled={pending} onClick={() => void syncNow(true)}>立即同步</button>}
          <div className="sync-step"><h3>连接另一台设备</h3><p>在另一台设备的“同步”中输入此码。持有码的人能读写这份进度，请只在自己的设备间传递。</p><div className="sync-actions"><button className="daily-button" onClick={() => void copyCode()}>复制同步码</button><button className="daily-button" onClick={() => setShowCode(value => !value)}>{showCode ? '隐藏同步码' : '显示同步码'}</button></div>{showCode && <textarea aria-label="本机同步码" readOnly value={syncClient.code()} rows={3} onFocus={event => event.target.select()} spellCheck={false} />}</div>
          <div className="sync-actions"><button className="daily-button" onClick={exportBackup}>导出冲突备份</button><button className="daily-button" disabled={pending} onClick={() => setConfirmDisconnect(true)}>断开本机同步</button></div>
          {confirmDisconnect && <div className="sync-conflict"><p>断开后保留本机和云端进度，其他设备仍可同步。</p><div className="sync-actions"><button className="daily-button" onClick={() => { void disconnectSync(); setConfirmDisconnect(false); setShowCode(false); }}>确认断开</button><button className="daily-button" onClick={() => setConfirmDisconnect(false)}>取消</button></div></div>}
        </>}
        {notice && <p role="status">{notice}</p>}
      </section>
    </div>, document.body)}
  </>;
}
