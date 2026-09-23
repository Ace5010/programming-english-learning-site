import { assertSnapshot, SYNC_LIMIT, validSyncCode } from '../../src/syncProtocol.ts';

interface Statement { bind(...args: (string | number)[]): Statement }
interface Result { results: Record<string, unknown>[]; meta: { changes: number } }
interface Database { prepare(sql: string): Statement; batch(statements: Statement[]): Promise<Result[]> }
interface Context { request: Request; env: { CODEWORDS_SYNC_DB?: Database } }
const origins = new Set(['https://programming-english-learning-site.pages.dev', 'https://ace5010.github.io', 'https://appassets.androidplatform.net']);
async function hash(text: string) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join(''); }

export async function onRequest({ request, env }: Context): Promise<Response> {
  const origin = request.headers.get('Origin');
  const headers: Record<string, string> = { 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' };
  const reply = (body: unknown, status = 200) => Response.json(body, { status, headers });
  if (origin && !origins.has(origin)) return reply({ error: 'origin' }, 403);
  if (origin) headers['Access-Control-Allow-Origin'] = origin;
  if (request.method === 'OPTIONS') {
    headers['Access-Control-Allow-Methods'] = 'GET, PUT, OPTIONS'; headers['Access-Control-Allow-Headers'] = 'Authorization, Content-Type'; headers['Access-Control-Max-Age'] = '600';
    return new Response(null, { status: 204, headers });
  }
  if (!['GET', 'PUT'].includes(request.method)) return reply({ error: 'method' }, 405);
  const authorization = request.headers.get('Authorization') ?? '';
  const code = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  if (!validSyncCode(code)) return reply({ error: 'authentication' }, 401);
  const db = env.CODEWORDS_SYNC_DB;
  if (!db) return reply({ error: 'unavailable' }, 503);
  try {
    const id = await hash(code);
    if (request.method === 'GET') {
      // One D1 batch is transactional, so head and chunks always belong to one revision.
      const [head, parts] = await db.batch([
        db.prepare('SELECT revision FROM sync_profiles WHERE id = ?1').bind(id),
        db.prepare('SELECT data FROM sync_parts WHERE profile_id = ?1 AND revision = (SELECT revision FROM sync_profiles WHERE id = ?1) ORDER BY part').bind(id),
      ]);
      if (!head.results.length || !Number(head.results[0].revision)) return reply({ error: 'missing' }, 404);
      const snapshot = JSON.parse(parts.results.map(part => part.data).join(''));
      assertSnapshot(snapshot);
      return reply({ version: 1, revision: head.results[0].revision, snapshot });
    }
    if (!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json')) return reply({ error: 'content-type' }, 415);
    const reader = request.body?.getReader(); if (!reader) return reply({ error: 'body' }, 400);
    let length = 0; const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > SYNC_LIMIT + 1024) { await reader.cancel(); return reply({ error: 'size' }, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    let body;
    try {
      body = JSON.parse(new TextDecoder().decode(bytes));
      if (body.version !== 1 || !Number.isSafeInteger(body.revision) || body.revision < 0) throw new Error();
      assertSnapshot(body.snapshot);
    } catch { return reply({ error: 'record' }, 400); }
    const next = body.revision + 1, now = Date.now(), writeId = crypto.randomUUID();
    const text = JSON.stringify(body.snapshot);
    // Only this request can attach chunks after its successful compare-and-swap.
    // Chunking avoids D1's per-row limit as vocabulary review history grows.
    const statements: Statement[] = [];
    if (body.revision === 0) {
      const bucket = await hash(`${new Date(now).toISOString().slice(0, 10)}:${request.headers.get('CF-Connecting-IP') ?? 'unknown'}`);
      statements.push(db.prepare('INSERT OR IGNORE INTO sync_profiles (id, revision, write_id, updated_at, created_at, bucket) SELECT ?1, 0, ?2, ?3, ?3, ?4 WHERE (SELECT COUNT(*) FROM sync_profiles WHERE bucket = ?4) < 5 AND (SELECT COUNT(*) FROM sync_profiles WHERE created_at >= ?5) < 100').bind(id, writeId, now, bucket, now - 86400000));
    }
    const updateIndex = statements.length;
    statements.push(db.prepare('UPDATE sync_profiles SET revision = ?1, write_id = ?2, updated_at = ?3 WHERE id = ?4 AND revision = ?5').bind(next, writeId, now, id, body.revision));
    for (let start = 0, part = 0; start < text.length; part++) {
      let end = Math.min(start + 300000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
      statements.push(db.prepare('INSERT INTO sync_parts (profile_id, revision, part, data) SELECT id, revision, ?1, ?2 FROM sync_profiles WHERE id = ?3 AND write_id = ?4').bind(part, text.slice(start, end), id, writeId));
      start = end;
    }
    // Keep the preceding revision too; CAS losers cannot prune or modify anything.
    statements.push(db.prepare('DELETE FROM sync_parts WHERE profile_id = ?1 AND revision < ?2 AND EXISTS (SELECT 1 FROM sync_profiles WHERE id = ?1 AND write_id = ?3)').bind(id, next - 1, writeId));
    const result = await db.batch(statements);
    if (!result[updateIndex].meta.changes) {
      const [exists] = await db.batch([db.prepare('SELECT revision FROM sync_profiles WHERE id = ?1').bind(id)]);
      return reply({ error: exists.results.length ? 'conflict' : 'limit' }, exists.results.length ? 409 : 429);
    }
    return reply({ version: 1, revision: next, snapshot: body.snapshot });
  } catch {
    // Do not put authentication codes, progress or database errors into logs/responses.
    return reply({ error: 'unavailable' }, 503);
  }
}
