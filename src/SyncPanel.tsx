import { useState, useSyncExternalStore } from 'react';
import { connectSync, disconnectSync, getSyncStatus, subscribeSync, syncClient, syncNow } from './syncClient';
import { SYNC_BACKUP } from './progressSync';
import { downloadRecord } from './nativeAndroid';
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
  const [enterCode, setEnterCode] = useState(false), [code, setCode] = useState(''), [showCode, setShowCode] = useState(false), [notice, setNotice] = useState(''), [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const pending = status.state === 'syncing';
  const copies = syncClient.conflictCopies();
  function exportBackup() {
    const raw = localStorage.getItem(SYNC_BACKUP);
    if (raw) downloadRecord('codewords-sync-backup.json', raw); else setNotice('目前没有冲突备份。');
  }
  async function copyCode() {
    try { await navigator.clipboard.writeText(syncClient.code()); setNotice('同步码已复制。'); }
    catch { setShowCode(true); setNotice('请长按或选中同步码复制。'); }
  }
  return <section className="settings-sync" aria-label="设备同步">
        <p className={`sync-status sync-${status.state}`} role="status">{status.message}{status.state === 'synced' && status.syncedAt > 0 ? ` · ${new Date(status.syncedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}` : ''}</p>
        {!status.paired ? <>
          <div className="sync-actions"><button type="button" className="daily-button primary" onClick={() => void connectSync()} disabled={pending}>开启同步</button><button type="button" className="daily-button" aria-expanded={enterCode} onClick={() => setEnterCode(value => !value)} disabled={pending}>输入已有同步码</button></div>
          <p>在已有进度的设备上开启同步，再把同步码输入另一台设备。</p>
          {enterCode && <form className="sync-step" onSubmit={event => { event.preventDefault(); void connectSync(code); }}><label htmlFor="sync-code">输入已有同步码</label><textarea id="sync-code" value={code} onChange={event => setCode(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} rows={3} placeholder="粘贴另一台设备的同步码" /><button className="daily-button" type="submit" disabled={!code.trim() || pending}>连接已有进度</button></form>}
        </> : <>
          {status.state === 'conflict' ? <div className="sync-conflict"><p>冲突部分：{status.conflicts.join('、')}。选择后会先备份两份记录，再继续同步；其他部分和收藏仍会合并。</p><div className="sync-copies">{copies && <><p><strong>本机：</strong>{describe(copies.local)}</p><p><strong>另一设备：</strong>{describe(copies.remote)}</p></>}</div><div className="sync-actions"><button className="daily-button" onClick={() => void syncNow(true, 'local')}>备份后继续本机记录</button><button className="daily-button" onClick={() => void syncNow(true, 'remote')}>备份后使用另一设备记录</button></div></div> : <button className="daily-button primary" disabled={pending} onClick={() => void syncNow(true)}>立即同步</button>}
          <div className="sync-step"><h4>连接另一台设备</h4><p>在另一台设备的“设置 → 学习数据 → 设备同步”中输入此码。持有码的人能读写这份进度，请只在自己的设备间传递。</p><div className="sync-actions"><button className="daily-button" onClick={() => void copyCode()}>复制同步码</button><button className="daily-button" onClick={() => setShowCode(value => !value)}>{showCode ? '隐藏同步码' : '显示同步码'}</button></div>{showCode && <textarea aria-label="本机同步码" readOnly value={syncClient.code()} rows={3} onFocus={event => event.target.select()} spellCheck={false} />}</div>
          <div className="sync-actions sync-secondary-actions"><button className="daily-button" onClick={exportBackup}>导出冲突备份</button><button className="daily-button" disabled={pending} onClick={() => setConfirmDisconnect(true)}>断开本机同步</button></div>
          {confirmDisconnect && <div className="sync-conflict"><p>断开后保留本机和云端进度，其他设备仍可同步。</p><div className="sync-actions"><button className="daily-button" onClick={() => { void disconnectSync(); setConfirmDisconnect(false); setShowCode(false); }}>确认断开</button><button className="daily-button" onClick={() => setConfirmDisconnect(false)}>取消</button></div></div>}
        </>}
        {notice && <p role="status">{notice}</p>}
      </section>;
}
