import { useId, useSyncExternalStore } from 'react';
import Icon from './Icon';
import { getSyncStatus, subscribeSync } from './syncClient';

export default function SettingsButton({ onClick, className = '' }: { onClick: () => void; className?: string }) {
  const status = useSyncExternalStore(subscribeSync, getSyncStatus);
  const statusId = useId();
  const needsAttention = status.state === 'error' || status.state === 'conflict';
  return <button type="button" className={`settings-trigger ${className}`} aria-label="设置" aria-haspopup="dialog" aria-describedby={needsAttention ? statusId : undefined} onClick={onClick}>
    <Icon name="settings" /><span className="settings-trigger-label">设置</span>
    {needsAttention && <><span className="settings-attention" aria-hidden="true">!</span><span className="settings-visually-hidden" id={statusId}>{status.message}，可在学习数据中处理。</span></>}
  </button>;
}
