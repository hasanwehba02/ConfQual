export const PAPERS_DEFAULT = Object.freeze({
  filterMode: 'all',
  sortBy: 'external_submission_id',
  sortOrder: 'DESC',
});

export function resolveActiveConferenceId(conferences, activeId) {
  if (activeId != null) return activeId;
  if (!Array.isArray(conferences) || conferences.length === 0) return null;
  return conferences[0].id; // list is ORDER BY uploaded_at DESC
}

export function encodePapersHash(state) {
  const params = new URLSearchParams();
  if (state.conferenceId != null) params.set('c', state.conferenceId);
  if (state.filterMode !== PAPERS_DEFAULT.filterMode) params.set('f', state.filterMode);
  if (state.sortBy !== PAPERS_DEFAULT.sortBy) params.set('s', state.sortBy);
  if (state.sortOrder !== PAPERS_DEFAULT.sortOrder) params.set('o', state.sortOrder);
  if (state.searchText) params.set('q', state.searchText);
  const qs = params.toString();
  return qs ? `#/papers?${qs}` : '#/papers';
}

export function parsePapersHash(hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#/papers')) return null;
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return {};
  return Object.fromEntries(new URLSearchParams(hash.slice(qIndex + 1)));
}

export function sanitizePapersState(raw, options) {
  const state = { ...PAPERS_DEFAULT, conferenceId: null, searchText: '' };
  const c = parseInt(raw.c, 10);
  if (options.conferenceIds && options.conferenceIds.includes(c)) state.conferenceId = c;
  if (typeof raw.f === 'string' && options.filterModes.includes(raw.f)) state.filterMode = raw.f;
  if (typeof raw.s === 'string' && options.sortFields.includes(raw.s)) state.sortBy = raw.s;
  if (typeof raw.o === 'string') {
    const up = raw.o.toUpperCase();
    if (up === 'ASC' || up === 'DESC') state.sortOrder = up;
  }
  if (typeof raw.q === 'string') state.searchText = raw.q.slice(0, 200);
  return state;
}

const PRESET_KEY_PREFIX = 'confqual:preset:v1:papers:';

export function createPreset({ name, filterMode, sortBy, sortOrder }) {
  return { id: `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
           name, filterMode, sortBy, sortOrder, createdAt: Date.now() };
}

export function createPresetStore(storage) {
  const readAll = (confId) => {
    try {
      const parsed = JSON.parse(storage.getItem(`${PRESET_KEY_PREFIX}${confId}`));
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const writeAll = (confId, presets) =>
    storage.setItem(`${PRESET_KEY_PREFIX}${confId}`, JSON.stringify(presets));
  return {
    getPresets: readAll,
    savePreset(confId, preset) { const all = readAll(confId); all.push(preset); writeAll(confId, all); return preset; },
    deletePreset(confId, id) { writeAll(confId, readAll(confId).filter(p => p.id !== id)); },
    renamePreset(confId, id, name) {
      const all = readAll(confId);
      const t = all.find(p => p.id === id);
      if (!t) return null;
      t.name = name; writeAll(confId, all); return t;
    },
  };
}
