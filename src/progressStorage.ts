// Notify only after a successful write; a course write and its review evidence are
// synchronous, so the debounced sync always sees the complete pair.
export const PROGRESS_CHANGED = 'codewords-progress-changed';
export const REMOTE_APPLIED = 'codewords-remote-applied';
const blockers = new Set<string>();
export function blockSyncApply(id: string, blocked: boolean) { if (blocked) blockers.add(id); else blockers.delete(id); }
export function canApplySync() {
  return !blockers.size && !document.activeElement?.matches('input, textarea, select, [contenteditable="true"]');
}
export const progressStorage = {
  getItem: (key: string) => localStorage.getItem(key),
  setItem(key: string, value: string) {
    if (localStorage.getItem('codewords-sync-journal-v1')) throw new Error('同步记录正在恢复，请稍后重新加载。');
    if (localStorage.getItem(key) === value) return;
    localStorage.setItem(key, value);
    window.dispatchEvent(new Event(PROGRESS_CHANGED));
  },
};
