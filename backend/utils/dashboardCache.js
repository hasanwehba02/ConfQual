const cache = new Map();
const inflight = new Map();
const TTL_MS = 60 * 1000;

function keyFor(editionId, anonymized) { return `${editionId ?? 'null'}:${anonymized ? 1 : 0}`; }

function get(editionId, anonymized) {
  const k = keyFor(editionId, anonymized);
  const entry = cache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { cache.delete(k); return null; }
  return entry.value;
}

function set(editionId, anonymized, value) {
  const k = keyFor(editionId, anonymized);
  cache.set(k, { value, ts: Date.now() });
}

function del(editionId) {
  if (editionId == null) { cache.clear(); inflight.clear(); return; }
  for (const k of [...cache.keys()]) if (k.startsWith(`${editionId}:`)) cache.delete(k);
  for (const k of [...inflight.keys()]) if (k.startsWith(`${editionId}:`)) inflight.delete(k);
}

async function coalesce(editionId, anonymized, fn) {
  const k = keyFor(editionId, anonymized);
  if (inflight.has(k)) return inflight.get(k);
  const p = fn().finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

module.exports = { get, set, del, coalesce, TTL_MS };
