import { ProgressSync, SYNC_META, SYNC_JOURNAL } from './progressSync.ts';
import { validateProgressSnapshot } from './syncValidation.ts';
import { PROGRESS_CHANGED, REMOTE_APPLIED, canApplySync } from './progressStorage.ts';
import { SYNC_KEYS } from './syncProtocol.ts';
const listeners = new Set<() => void>();
export const syncClient = new ProgressSync({
  storage: { getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value), removeItem: key => localStorage.removeItem(key) },
  fetch: (...args) => fetch(...args), validate: validateProgressSnapshot, canApply: canApplySync,
  changed: () => listeners.forEach(listener => listener()),
  applied: () => window.dispatchEvent(new Event(REMOTE_APPLIED)),
});
export const subscribeSync = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getSyncStatus = () => syncClient.status;
async function locked(action: () => Promise<void> | void) {
  if (navigator.locks) await navigator.locks.request('codewords-progress-sync', { ifAvailable: true }, async lock => { if (lock) await action(); });
  else await action(); // Engine CAS still prevents remote overwrites on older WebViews.
}
export const syncNow = (force = false, prefer?: 'local' | 'remote') => locked(() => syncClient.sync(force, prefer));
export const connectSync = (code?: string) => locked(() => syncClient.connect(code));
export const disconnectSync = () => locked(() => syncClient.disconnect());
let started = false;
export async function startProgressSync() {
  if (started) return; started = true;
  // A newly opened tab must not mistake another tab's live transaction for a crash.
  if (navigator.locks) await navigator.locks.request('codewords-progress-sync', () => syncClient.initialize());
  else syncClient.initialize();
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void syncNow(); }, 2000); };
  window.addEventListener(PROGRESS_CHANGED, schedule);
  window.addEventListener('online', schedule); window.addEventListener('focus', schedule);
  window.addEventListener('storage', event => {
    if (localStorage.getItem(SYNC_JOURNAL)) return;
    if (event.key === SYNC_META || event.key === null) syncClient.initialize();
    // Never start recovery in the middle of another tab's local transaction.
    else if (SYNC_KEYS.includes(event.key as typeof SYNC_KEYS[number])) schedule();
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });
  setInterval(() => { if (!document.hidden && navigator.onLine) void syncNow(); }, 30000);
  schedule();
}
