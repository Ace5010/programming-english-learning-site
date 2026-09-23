import { SYNC_KEYS, emptySnapshot, assertSnapshot, mergeSnapshots, sameSnapshot, normalizeSyncCode, validSyncCode, type Snapshot } from './syncProtocol.ts';

export const SYNC_META = 'codewords-sync-v1';
export const SYNC_JOURNAL = 'codewords-sync-journal-v1';
export const SYNC_BACKUP = 'codewords-sync-backup-v1';
export const SYNC_ENDPOINT = 'https://programming-english-learning-site.pages.dev/api/sync';
export type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
interface Meta { version: 1; code: string; base: Snapshot; revision: number; canCreate: boolean; syncedAt: number }
export interface SyncStatus { state: 'local' | 'waiting' | 'syncing' | 'synced' | 'error' | 'conflict'; message: string; paired: boolean; syncedAt: number; conflicts: string[] }
interface Remote { version: 1; revision: number; snapshot: Snapshot }
interface Options { storage: Store; fetch: typeof fetch; validate: (value: unknown) => void; changed?: () => void; applied?: () => void; canApply?: () => boolean; endpoint?: string }
export function readSnapshot(storage: Store): Snapshot { return Object.fromEntries(SYNC_KEYS.map(key => [key, storage.getItem(key)])) as Snapshot; }

// A recoverable local transaction: never leave half a remote course/review snapshot.
// Keeping this journal if rollback fails blocks future writes until recovery succeeds.
export function recoverSyncJournal(storage: Store) {
  const raw = storage.getItem(SYNC_JOURNAL); if (!raw) return;
  const journal = JSON.parse(raw);
  if (journal.version !== 1 || !journal.before || typeof journal.before !== 'object') throw new Error('同步恢复记录无法读取，请导出记录后处理。');
  for (const [key, value] of Object.entries(journal.before)) {
    if (![...SYNC_KEYS, SYNC_META].includes(key) || value !== null && typeof value !== 'string') throw new Error('同步恢复记录无效。');
  }
  for (const [key, value] of Object.entries(journal.before)) value === null ? storage.removeItem(key) : storage.setItem(key, value as string);
  storage.removeItem(SYNC_JOURNAL);
}
function transaction(storage: Store, values: Record<string, string | null>) {
  if (storage.getItem(SYNC_JOURNAL)) throw new Error('上次同步尚未恢复，请重新打开应用。');
  const before = Object.fromEntries(Object.keys(values).map(key => [key, storage.getItem(key)]));
  storage.setItem(SYNC_JOURNAL, JSON.stringify({ version: 1, before }));
  try {
    for (const [key, value] of Object.entries(values)) value === null ? storage.removeItem(key) : storage.setItem(key, value);
    storage.removeItem(SYNC_JOURNAL);
  } catch (error) { recoverSyncJournal(storage); throw error; }
}
export class ProgressSync {
  private options: Options;
  private running = false;
  private generation = 0;
  private conflict: { local: Snapshot; remote: Remote } | null = null;
  status: SyncStatus = { state: 'local', message: '仅保存在本机', paired: false, syncedAt: 0, conflicts: [] };
  constructor(options: Options) { this.options = options; }
  private set(state: SyncStatus['state'], message: string, conflicts: string[] = []) {
    this.status = { ...this.status, state, message, conflicts }; this.options.changed?.();
  }
  private meta(): Meta | null {
    const raw = this.options.storage.getItem(SYNC_META); if (!raw) return null;
    const meta = JSON.parse(raw);
    if (meta.version !== 1 || !validSyncCode(meta.code) || !Number.isSafeInteger(meta.revision) || meta.revision < 0 || typeof meta.canCreate !== 'boolean' || !Number.isFinite(meta.syncedAt)) throw new Error('同步设置无法读取，原记录已保留。');
    assertSnapshot(meta.base); this.options.validate(meta.base); return meta;
  }
  initialize() {
    try {
      recoverSyncJournal(this.options.storage);
      const meta = this.meta(); this.status.paired = !!meta; this.status.syncedAt = meta?.syncedAt ?? 0;
      const synced = meta && meta.syncedAt > 0 && sameSnapshot(readSnapshot(this.options.storage), meta.base);
      this.set(synced ? 'synced' : meta ? 'waiting' : 'local', synced ? '进度已同步' : meta ? '等待同步' : '仅保存在本机');
    } catch (error) { this.fail(error); }
  }
  code() { return this.meta()?.code ?? ''; }
  conflictCopies() { return this.conflict ? { local: this.conflict.local, remote: this.conflict.remote.snapshot } : null; }
  private fail(error: unknown) { this.set('error', error instanceof Error ? error.message : '同步未完成，本机记录仍保留。'); }
  async connect(input?: string) {
    if (this.running) return;
    try {
      if (this.meta()) throw new Error('本机已经连接同步，请先断开后再更换同步码。');
      const code = input === undefined ? Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('') : normalizeSyncCode(input);
      if (!validSyncCode(code)) throw new Error('同步码应为 64 位字符，请完整复制。');
      const local = readSnapshot(this.options.storage); this.options.validate(local);
      const meta: Meta = { version: 1, code, base: emptySnapshot(), revision: 0, canCreate: input === undefined, syncedAt: 0 };
      this.options.storage.setItem(SYNC_META, JSON.stringify(meta)); this.status.paired = true;
      await this.sync(true);
    } catch (error) { this.fail(error); }
  }
  disconnect() {
    // Generation cancels in-flight responses without deleting either copy of progress.
    this.options.storage.removeItem(SYNC_META); this.generation++; this.conflict = null;
    this.status.paired = false; this.status.syncedAt = 0; this.set('local', '已断开同步，本机记录仍保留');
  }
  private async request(code: string, init: RequestInit = {}) {
    const response = await this.options.fetch(this.options.endpoint ?? SYNC_ENDPOINT, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${code}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}) } });
    if (response.status === 404 || response.status === 409) return { response, data: null };
    if (!response.ok) throw new Error(response.status === 429 ? '同步服务繁忙，请稍后再试。本机记录已保存。' : '同步服务暂时不可用，本机记录已保存，稍后重试。');
    const data: Remote = await response.json();
    if (data.version !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 1) throw new Error('同步服务返回了不支持的记录。');
    assertSnapshot(data.snapshot); this.options.validate(data.snapshot); return { response, data };
  }
  async sync(force = false, preference?: 'local' | 'remote') {
    if (this.running) return;
    this.running = true; const generation = this.generation;
    try {
      let meta = this.meta(); if (!meta) return;
      const originalCode = meta.code;
      const current = () => generation === this.generation && this.meta()?.code === originalCode;
      this.status.paired = true; this.set('syncing', '正在同步');
      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await this.request(meta.code); if (!current()) return;
        let remote = result.data;
        if (!remote && !meta.canCreate) throw new Error('没有找到这份进度，请核对同步码。');
        if (!remote && meta.revision !== 0) throw new Error('云端记录暂时不可用，本机记录仍保留。');
        const local = readSnapshot(this.options.storage); this.options.validate(local);
        remote ??= { version: 1, revision: 0, snapshot: emptySnapshot() };
        // A conflict decision is valid only for the two copies the user actually saw.
        if (preference && (!this.conflict || !sameSnapshot(local, this.conflict.local) || !sameSnapshot(remote.snapshot, this.conflict.remote.snapshot))) preference = undefined;
        const merged = mergeSnapshots(meta.base, local, remote.snapshot, preference);
        if (merged.conflicts.length && !preference) {
          this.conflict = { local, remote }; this.set('conflict', '两台设备都更新了同一部分，请选择要继续的记录', merged.conflicts); return;
        }
        const apply = !sameSnapshot(local, merged.snapshot);
        if (apply && this.options.canApply && !this.options.canApply()) { this.set('waiting', force ? '请先结束当前输入或练习，再同步另一设备的更新' : '另一台设备有更新，完成当前输入后同步'); return; }
        if (preference) {
          // Durable backup before resolving either direction; failure leaves both untouched.
          this.options.storage.setItem(SYNC_BACKUP, JSON.stringify({ version: 1, at: Date.now(), local, remote: remote.snapshot }));
          this.conflict = null; preference = undefined;
        }
        meta = { ...meta, base: remote.snapshot, revision: remote.revision };
        const changes: Record<string, string | null> = { [SYNC_META]: JSON.stringify(meta) };
        if (apply) for (const key of SYNC_KEYS) if (local[key] !== merged.snapshot[key]) changes[key] = merged.snapshot[key];
        transaction(this.options.storage, changes);
        if (apply) this.options.applied?.();
        if (!sameSnapshot(merged.snapshot, remote.snapshot) || remote.revision === 0) {
          const pushed = await this.request(meta.code, { method: 'PUT', body: JSON.stringify({ version: 1, revision: remote.revision, snapshot: merged.snapshot }) });
          if (!current()) return;
          if (pushed.response.status === 409) continue;
          if (!pushed.data || !sameSnapshot(pushed.data.snapshot, merged.snapshot)) throw new Error('云端尚未确认保存，下次联网会再次核对。');
          meta = { ...meta, base: merged.snapshot, revision: pushed.data.revision };
        }
        meta = { ...meta, canCreate: false, syncedAt: Date.now() };
        this.options.storage.setItem(SYNC_META, JSON.stringify(meta)); this.status.syncedAt = meta.syncedAt;
        const pending = !sameSnapshot(readSnapshot(this.options.storage), meta.base);
        this.set(pending ? 'waiting' : 'synced', pending ? '本机有新进度，等待上传' : '进度已同步'); return;
      }
      this.set('waiting', '另一台设备正在学习，稍后再同步');
    } catch (error) {
      if (generation === this.generation) this.fail(error instanceof TypeError || error instanceof DOMException && error.name === 'TimeoutError' ? new Error('网络暂时不可用，本机记录已保存，联网后自动同步。') : error);
    } finally { this.running = false; }
  }
}
