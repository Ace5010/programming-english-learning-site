export interface PairItem { id: string; en: string; zh: string; audioId: string }
export type PairOutcome = 'independent' | 'assisted' | 'revealed' | 'unmeasured';
export interface PairState {
  selected: string | null;
  matches: Record<string, PairOutcome>;
  mistakes: Record<string, number>;
  observedAt: Record<string, number>;
  message: string;
  wrong?: string;
}
export const createPairState = (): PairState => ({ selected: null, matches: {}, mistakes: {}, observedAt: {}, message: '' });
export const pairsComplete = (items: PairItem[], state?: PairState) => items.length >= 2 && items.every(item => !!state?.matches[item.id]);

function finishPair(items: PairItem[], state: PairState, id: string, outcome: PairOutcome): PairState {
  const { wrong: _wrong, ...previous } = state;
  const next = { ...previous, selected: null, matches: { ...state.matches, [id]: outcome } };
  const remaining = items.filter(item => !next.matches[item.id]);
  // The final forced association is exposure, not independently tested knowledge.
  if (remaining.length === 1) next.matches[remaining[0].id] = 'unmeasured';
  return next;
}
export function selectPair(state: PairState, selected: string): PairState {
  const { wrong: _wrong, ...previous } = state;
  return { ...previous, selected };
}
export function choosePair(items: PairItem[], state: PairState, rightId: string, now = Date.now()): PairState {
  const left = items.find(item => item.id === state.selected);
  if (!left || state.matches[left.id] || state.matches[rightId] || state.wrong === rightId || !items.some(item => item.id === rightId)) return state;
  if (left.id === rightId) return finishPair(items, { ...state, message: `${left.en} — ${left.zh}` }, left.id, state.mistakes[left.id] ? 'assisted' : 'independent');
  const mistakes = (state.mistakes[left.id] ?? 0) + 1;
  const next = { ...state, mistakes: { ...state.mistakes, [left.id]: mistakes }, observedAt: { ...state.observedAt, [left.id]: state.observedAt[left.id] ?? now }, wrong: rightId };
  if (mistakes >= 2 || items.filter(item => !state.matches[item.id]).length <= 2) return finishPair(items, { ...next, message: `${left.en} 对应“${left.zh}”，后面会再练。` }, left.id, 'revealed');
  return { ...next, message: '这两个选项不对应，再选择一次。' };
}
export function revealPair(items: PairItem[], state: PairState, now = Date.now()): PairState {
  const target = items.find(item => item.id === state.selected && !state.matches[item.id]) ?? items.find(item => !state.matches[item.id]);
  if (!target) return state;
  return finishPair(items, { ...state, message: `${target.en} 对应“${target.zh}”。`, mistakes: { ...state.mistakes, [target.id]: Math.max(1, state.mistakes[target.id] ?? 0) }, observedAt: { ...state.observedAt, [target.id]: state.observedAt[target.id] ?? now } }, target.id, 'revealed');
}
export function pairOrder(items: PairItem[], seed: string): PairItem[] {
  const rank = (id: string) => { let value = 2166136261; for (const c of seed + id) value = Math.imul(value ^ c.charCodeAt(0), 16777619); return value >>> 0; };
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}
export function validPairState(value: unknown): value is PairState {
  if (!value || typeof value !== 'object') return false;
  const state = value as PairState;
  const record = (input: unknown): input is Record<string, unknown> => !!input && typeof input === 'object' && !Array.isArray(input) && Object.keys(input).length <= 4;
  return (state.selected === null || typeof state.selected === 'string') && typeof state.message === 'string' && state.message.length < 1000
    && (state.wrong === undefined || typeof state.wrong === 'string')
    && record(state.matches) && Object.values(state.matches).every(value => ['independent', 'assisted', 'revealed', 'unmeasured'].includes(String(value)))
    && record(state.mistakes) && Object.values(state.mistakes).every(value => Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 2)
    && record(state.observedAt) && Object.values(state.observedAt).every(value => typeof value === 'number' && Number.isFinite(value) && value > 0);
}
