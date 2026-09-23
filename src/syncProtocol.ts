// Shared by the browser and Pages Function. Existing storage keys/formats stay intact.
export const SYNC_KEYS = ['codewords-mastered', 'codewords-favorites', 'codewords-quiz-last-tested', 'codewords-quiz-sessions', 'codewords-best-score', 'codewords-review-v1', 'codewords-programming-course-v1', 'codewords-daily-v1'] as const;
export type SyncKey = typeof SYNC_KEYS[number];
export type Snapshot = Record<SyncKey, string | null>;
export const SYNC_LIMIT = 8 * 1024 * 1024;
export const emptySnapshot = (): Snapshot => Object.fromEntries(SYNC_KEYS.map(key => [key, null])) as Snapshot;
export function assertSnapshot(value: unknown): asserts value is Snapshot {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('同步记录格式无效。');
  const entries = Object.entries(value);
  if (entries.length !== SYNC_KEYS.length || entries.some(([key, raw]) => !SYNC_KEYS.includes(key as SyncKey) || raw !== null && typeof raw !== 'string')) throw new Error('同步记录包含不支持的字段。');
  if (new TextEncoder().encode(JSON.stringify(value)).length > SYNC_LIMIT) throw new Error('记录超过同步容量，现有记录仍保留。');
  for (const [, raw] of entries) if (raw !== null) JSON.parse(raw as string);
}
export function normalizeSyncCode(value: string) { return value.replace(/[\s-]/g, '').toLowerCase(); }
export function validSyncCode(value: string) { return /^[a-f0-9]{64}$/.test(value); }

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => JSON.stringify(key) + ':' + canonical(item)).join(',') + '}';
  return JSON.stringify(value);
}
export const sameValue = (a: string | null, b: string | null) => a === b || a !== null && b !== null && canonical(JSON.parse(a)) === canonical(JSON.parse(b));
export const sameSnapshot = (a: Snapshot, b: Snapshot) => SYNC_KEYS.every(key => sameValue(a[key], b[key]));
const groups: { name: string; keys: SyncKey[] }[] = [
  { name: '编程课程和复习', keys: ['codewords-mastered', 'codewords-review-v1', 'codewords-programming-course-v1', 'codewords-quiz-last-tested', 'codewords-quiz-sessions', 'codewords-best-score'] },
  { name: '日常英语', keys: ['codewords-daily-v1'] },
];
function vacant(key: SyncKey, raw: string | null) {
  if (raw === null) return true;
  const value = JSON.parse(raw);
  if (key === 'codewords-mastered') return Array.isArray(value) && !value.length;
  if (key === 'codewords-quiz-sessions' || key === 'codewords-best-score') return value === 0;
  if (key === 'codewords-quiz-last-tested') return !Object.keys(value).length;
  if (key === 'codewords-review-v1') return value.version === 1 && !Object.keys(value.words).length;
  return value.version === 1 && !value.session && !Object.keys(value.lessons).length && !Object.keys(value.knowledge ?? {}).length && !(value.favorites?.length) && !value.learning;
}
/** Three-way merging keeps linked course/review evidence together. Conflicting evidence
 * is never added, averaged or replaced by a device's clock. */
export function mergeSnapshots(base: Snapshot, local: Snapshot, remote: Snapshot, prefer?: 'local' | 'remote') {
  const snapshot = { ...local }; const conflicts: string[] = [];
  for (const group of groups) {
    const equal = (a: Snapshot, b: Snapshot) => group.keys.every(key => sameValue(a[key], b[key]) || vacant(key, a[key]) && vacant(key, b[key]));
    let source = local;
    if (equal(local, remote) || equal(remote, base)) source = local;
    else if (equal(local, base)) source = remote;
    else { conflicts.push(group.name); if (prefer === 'remote') source = remote; }
    for (const key of group.keys) snapshot[key] = source[key];
  }
  // Favorites are independent set additions/removals relative to the last shared copy.
  const sets = [base, local, remote].map(item => new Set<number>(JSON.parse(item['codewords-favorites'] ?? '[]')));
  const ids = new Set([...sets[0], ...sets[1], ...sets[2]]);
  snapshot['codewords-favorites'] = JSON.stringify([...ids].filter(id => sets[0].has(id) ? sets[1].has(id) && sets[2].has(id) : sets[1].has(id) || sets[2].has(id)).sort((a, b) => a - b));
  if (!JSON.parse(snapshot['codewords-favorites']).length && local['codewords-favorites'] === null && remote['codewords-favorites'] === null) snapshot['codewords-favorites'] = null;
  return { snapshot, conflicts };
}
