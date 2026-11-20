const cache = new Map();
const inflight = new Map();
const TTL_MS = 60 * 1000;
const db = require('../config/database');

function keyFor(editionId, anonymized) {
  const workspaceId = db.getWorkspaceId();
  return workspaceId ? JSON.stringify([workspaceId, editionId ?? null, !!anonymized]) : null;
}

function get(editionId, anonymized) {
  const k = keyFor(editionId, anonymized);
  if (!k) return null;
  const entry = cache.get(k);
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) { cache.delete(k); return null; }
  return entry.value;
}

function set(editionId, anonymized, value) {
  const k = keyFor(editionId, anonymized);
  if (!k) return;
  cache.set(k, { value, ts: Date.now() });
}

function del(editionId) {
  if (editionId == null) { cache.clear(); inflight.clear(); return; }
  for (const k of [...cache.keys()]) if (String(JSON.parse(k)[1]) === String(editionId)) cache.delete(k);
  for (const k of [...inflight.keys()]) if (String(JSON.parse(k)[1]) === String(editionId)) inflight.delete(k);
}

async function coalesce(editionId, anonymized, fn) {
  const k = keyFor(editionId, anonymized);
  if (!k) return fn();
  if (inflight.has(k)) return inflight.get(k);
  const p = Promise.resolve().then(fn).finally(() => { if (inflight.get(k) === p) inflight.delete(k); });
  inflight.set(k, p);
  return p;
}

module.exports = { get, set, del, coalesce, TTL_MS };
