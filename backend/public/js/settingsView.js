import { state } from './state.js';
import { loadDashboardData } from './dashboardView.js';

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function wireSettingsView() {
    const settingsBtn = document.getElementById('open-settings-btn') || document.getElementById('settings-btn');
    const settingsDrawer = document.getElementById('settings-drawer');
    const closeSettingsDrawer = document.getElementById('close-settings-drawer');
    const settingsForm = document.getElementById('settings-form');
    const isAnonymizedCheckbox = document.getElementById('isAnonymized');
    const decisionEditingEnabledCheckbox = document.getElementById('decisionEditingEnabled');

    async function loadConfig() {
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        const list = document.getElementById('config-list');
        if (!list) return;
        list.innerHTML = '<span class="text-muted">Loading…</span>';
        try {
            const qs = cid ? `?conferenceId=${cid}` : '';
            const res = await fetch(`/api/analytics/configuration${qs}`);
            const cfg = res.ok ? await res.json() : {};
            const fields = [
                ['review_deadline', 'Review deadline', 'date'],
                ['min_score', 'Min score', 'number'],
                ['max_score', 'Max score', 'number'],
                ['min_expertise', 'Min expertise', 'number'],
                ['max_expertise', 'Max expertise', 'number'],
                ['nb_reviewers', 'Nb reviewers', 'number'],
                ['paper_types', 'Paper types (comma)', 'text'],
                ['bidding_types', 'Bidding types', 'text'],
                ['metareviewer_recommendations', 'Meta-reviewer rec.', 'text'],
                ['other_events', 'Other events', 'text']
            ];
            const fieldTips = {
                review_deadline: 'Deadline for reviewers to submit reviews.',
                min_score: 'Minimum allowed review score (e.g. -3).',
                max_score: 'Maximum allowed review score (e.g. 3).',
                min_expertise: 'Minimum reviewer expertise level.',
                max_expertise: 'Maximum reviewer expertise level.',
                nb_reviewers: 'Default number of reviewers assigned per paper — drives the "Fewer than X assigned" alert and warning triangle.',
                paper_types: 'Comma-separated paper types (e.g. full, short, poster). Used for paper classification.',
                bidding_types: 'Comma-separated bidding options (e.g. yes, maybe, no).',
                metareviewer_recommendations: 'Possible meta-reviewer recommendations.',
                other_events: 'Other associated events for this edition.'
            };
            list.innerHTML = '';
            for (const [key, label, type] of fields) {
                const val = cfg[key];
                const display = Array.isArray(val) ? val.join(', ') : (val ?? '');
                const tip = fieldTips[key] || '';
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;';
                row.setAttribute('data-tip', tip);
                row.innerHTML = `<label style="flex:1;font-size:0.85rem;">${label}</label><input data-cfg="${key}" type="${type}" value="${escapeHtml(display)}" style="flex:1;padding:4px;border:1px solid var(--border);border-radius:var(--radius);max-width:180px;">`;
                list.appendChild(row);
            }
        } catch (e) {
            list.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
        }
    }

    function noteContext(n) {
        if (n.paper_id) return `on Paper #${n.external_submission_id || n.paper_id}${n.paper_title ? ' — ' + n.paper_title.slice(0, 40) : ''}`;
        if (n.review_id) return `on Review #${n.review_id}`;
        if (n.comment_id) return `on Comment #${n.comment_id}${n.comment_text ? ' — ' + n.comment_text.slice(0, 30) : ''}`;
        if (n.participant_id) return `on Participant #${n.participant_id}`;
        if (n.edition_note_id) return `on Edition #${n.edition_note_id}`;
        if (n.conference_id) return `on Conference Series`;
        if (n.topic_id) return `on Topic #${n.topic_id}`;
        return `on Edition (${n.note_edition_year || n.edition_id || ''})`;
    }

    function renderNote(n) {
        const hasNav = !!(n.paper_id || n.participant_id || n.review_id || n.comment_id);
        const navData = hasNav ? JSON.stringify({
            paper_id: n.paper_id,
            external_submission_id: n.external_submission_id,
            participant_id: n.participant_id,
            review_id: n.review_id,
            comment_id: n.comment_id
        }) : '';

        const contextText = noteContext(n);
        const contextHtml = hasNav
            ? `<span data-note-nav='${escapeHtml(navData)}' role="button" tabindex="0" style="cursor:pointer;color:var(--primary);text-decoration:underline;" title="Open details">${escapeHtml(contextText)}</span>`
            : `<span>${escapeHtml(contextText)}</span>`;

        return `
            <div class="note-item" data-note-id="${n.id}" data-note-text="${escapeHtml(n.text)}" style="padding:6px 0;border-bottom:1px solid var(--border-light);">
                <small class="text-muted">${new Date(n.created_at).toLocaleString()} · ${contextHtml}</small>
                <div class="note-content" style="margin-top:2px;font-size:0.85rem;white-space:pre-wrap;">${escapeHtml(n.text)}</div>
                <div style="margin-top:4px;display:flex;gap:6px;">
                    <button type="button" data-note-edit="${n.id}" class="btn btn-outline btn-sm" style="font-size:0.7rem;">Edit</button>
                    <button type="button" data-note-delete="${n.id}" class="btn btn-outline btn-sm" style="font-size:0.7rem;color:var(--alert-crimson);">Delete</button>
                </div>
            </div>
        `;
    }

    async function loadConferenceNotes() {
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        const list = document.getElementById('conference-notes-list');
        const editionList = document.getElementById('edition-notes-list');
        if (!list && !editionList) return;
        if (list) list.innerHTML = '<span class="text-muted">Loading…</span>';
        if (editionList) editionList.innerHTML = '<span class="text-muted">Loading…</span>';

        try {
            // Conference series notes
            const confRes = cid ? await fetch(`/api/analytics/notes?conferenceId=${cid}`) : null;
            const confNotes = confRes && confRes.ok ? await confRes.json() : [];

            // Edition notes
            const qs = cid ? `?editionId=${cid}` : '';
            const edRes = await fetch(`/api/analytics/notes${qs}`);
            const allNotes = edRes.ok ? await edRes.json() : [];

            // Edition notes exclude series-level notes to prevent duplicates
            const editionNotes = allNotes.filter(n => !n.conference_id);

            if (list) {
                list.innerHTML = confNotes.length
                    ? confNotes.map(renderNote).join('')
                    : '<span class="text-muted">No conference notes yet.</span>';
            }
            if (editionList) {
                editionList.innerHTML = editionNotes.length
                    ? editionNotes.map(renderNote).join('')
                    : '<span class="text-muted">No edition notes yet.</span>';
            }
        } catch (e) {
            if (list) list.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
            if (editionList) editionList.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
        }
    }

    function closeSettingsDrawerHelper() {
        const sd = document.getElementById('settings-drawer');
        if (sd) {
            sd.classList.remove('open');
            sd.classList.add('closed');
        }
    }

    function handleNotesListClick(e) {
        const editBtn = e.target.closest('[data-note-edit]');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            const id = editBtn.getAttribute('data-note-edit');
            const noteItem = editBtn.closest('.note-item');
            const current = noteItem ? (noteItem.getAttribute('data-note-text') || '') : '';
            const newText = prompt('Edit note:', current);
            if (newText === null || !newText.trim()) return;
            (async () => {
                await fetch(`/api/analytics/notes/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: newText.trim() })
                });
                await loadConferenceNotes();
            })();
            return;
        }

        const delBtn = e.target.closest('[data-note-delete]');
        if (delBtn) {
            e.preventDefault();
            e.stopPropagation();
            if (!confirm('Delete this note? This cannot be undone.')) return;
            const id = delBtn.getAttribute('data-note-delete');
            (async () => {
                await fetch(`/api/analytics/notes/${id}`, { method: 'DELETE' });
                await loadConferenceNotes();
            })();
            return;
        }

        const navEl = e.target.closest('[data-note-nav]');
        if (navEl) {
            e.preventDefault();
            e.stopPropagation();
            try {
                const data = JSON.parse(navEl.getAttribute('data-note-nav'));
                if (data.paper_id) {
                    closeSettingsDrawerHelper();
                    window.openPaperModal(data.external_submission_id || data.paper_id);
                } else if (data.participant_id) {
                    closeSettingsDrawerHelper();
                    window.openReviewerModal(data.participant_id, '');
                } else if (data.review_id || data.comment_id) {
                    if (data.paper_id) {
                        closeSettingsDrawerHelper();
                        window.openPaperModal(data.external_submission_id || data.paper_id);
                    }
                }
            } catch (err) {
                console.error('Error opening note context:', err);
            }
        }
    }

    // Attach event delegation ONCE for both note lists
    const confNotesList = document.getElementById('conference-notes-list');
    if (confNotesList) {
        confNotesList.addEventListener('click', handleNotesListClick);
    }
    const edNotesList = document.getElementById('edition-notes-list');
    if (edNotesList) {
        edNotesList.addEventListener('click', handleNotesListClick);
    }

    window.addEventListener('conferenceChanged', () => {
        const drawer = document.getElementById('settings-drawer');
        if (drawer && drawer.classList.contains('open')) {
            loadConferenceNotes();
            loadThresholds();
            loadConfig();
        }
    });

    async function loadThresholds() {
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        const list = document.getElementById('alert-thresholds-list');
        if (!list) return;
        list.innerHTML = '<span class="text-muted">Loading…</span>';
        try {
            const qs = cid ? `?conferenceId=${cid}` : '';
            const res = await fetch(`/api/analytics/alert-rules${qs}`);
            if (!res.ok) throw new Error('Failed to load thresholds');
            const rules = await res.json();
            list.innerHTML = '';
            const thresholdTips = {
                high_discrepancy: 'Threshold for paper score spread (standard deviation or range) to trigger a high discrepancy alert.',
                unanimous_reject: 'Threshold below which all review scores must fall to trigger a unanimous reject alert.',
                unanimous_accept: 'Threshold above which all review scores must fall to trigger a unanimous accept alert.',
                low_calibration: 'Absolute difference between a reviewer’s average score and conference average to flag reviewer calibration bias.',
                extreme_score: 'Score deviation threshold to flag individual outlier reviews.'
            };
            for (const r of rules) {
                const row = document.createElement('div');
                row.style.cssText = 'display:flex;align-items:center;gap:8px;font-size:0.85rem;';
                const tip = thresholdTips[r.key] || '';
                row.setAttribute('data-tip', tip);
                row.innerHTML = `
                    <label class="toggle" style="margin-right:4px;">
                        <input type="checkbox" data-enabled="${r.key}" ${r.enabled ? 'checked' : ''}>
                        <span class="toggle-slider"></span>
                    </label>
                    <label style="flex:1;">${escapeHtml(r.name || r.key)}</label>
                    <input type="number" step="0.1" value="${r.threshold}" data-key="${r.key}" style="width:80px;padding:4px;border:1px solid var(--border);border-radius:var(--radius);">
                `;
                list.appendChild(row);
            }
        } catch (e) {
            list.innerHTML = `<span class="text-danger">${escapeHtml(e.message)}</span>`;
        }
    }

    if (settingsBtn) {
        settingsBtn.addEventListener('click', async () => {
            if (!state.activeConferenceId && state.loadedConferences && state.loadedConferences.length > 0) {
                state.activeConferenceId = state.loadedConferences[0].id;
            }
            try {
                const response = await fetch('/api/settings');
                if (response.ok) {
                    const settings = await response.json();
                    if (isAnonymizedCheckbox) isAnonymizedCheckbox.checked = settings.is_anonymized;
                    if (decisionEditingEnabledCheckbox) decisionEditingEnabledCheckbox.checked = settings.decision_editing_enabled;
                }
            } catch (e) {
                console.error('Error fetching settings:', e);
            }
            await loadThresholds();
            await loadConfig();
            await loadConferenceNotes();
            settingsDrawer.classList.add('open');
            settingsDrawer.classList.remove('closed');
        });
    }

    document.getElementById('save-thresholds')?.addEventListener('click', async () => {
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        const list = document.getElementById('alert-thresholds-list');
        const inputs = list.querySelectorAll('input[data-key]');
        const rules = [];
        inputs.forEach(inp => {
            const key = inp.getAttribute('data-key');
            const chk = list.querySelector(`input[data-enabled="${key}"]`);
            rules.push({
                key,
                threshold: parseFloat(inp.value),
                enabled: chk ? chk.checked : true
            });
        });
        const qs = cid ? `?conferenceId=${cid}` : '';
        const res = await fetch(`/api/analytics/alert-rules${qs}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ rules })
        });
        if (res.ok) {
            const btn = document.getElementById('save-thresholds');
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="ph ph-check"></i> Saved!';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
            await loadDashboardData();
        }
    });

    document.getElementById('save-config')?.addEventListener('click', async () => {
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        const list = document.getElementById('config-list');
        const inputs = list.querySelectorAll('input[data-cfg]');
        const body = {};
        inputs.forEach(inp => {
            const k = inp.getAttribute('data-cfg');
            const val = inp.value.trim();
            if (inp.type === 'number') {
                body[k] = val !== '' ? parseFloat(val) : null;
            } else if (k === 'paper_types' || k === 'bidding_types' || k === 'metareviewer_recommendations' || k === 'other_events') {
                body[k] = val ? val.split(',').map(s => s.trim()).filter(Boolean) : [];
            } else {
                body[k] = val || null;
            }
        });
        const qs = cid ? `?conferenceId=${cid}` : '';
        const res = await fetch(`/api/analytics/configuration${qs}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        if (res.ok) {
            const btn = document.getElementById('save-config');
            const orig = btn.innerHTML;
            btn.innerHTML = '<i class="ph ph-check"></i> Saved!';
            setTimeout(() => { btn.innerHTML = orig; }, 1500);
        }
    });

    const confNoteAddBtn = document.getElementById('conference-note-add');
    const confNoteInput = document.getElementById('conference-note-input');
    const handleAddConferenceNote = async () => {
        const text = confNoteInput ? confNoteInput.value.trim() : '';
        if (!text) return;
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        await fetch('/api/analytics/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, conferenceId: cid, editionId: cid })
        });
        if (confNoteInput) confNoteInput.value = '';
        await loadConferenceNotes();
    };
    confNoteAddBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        handleAddConferenceNote();
    });
    confNoteInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddConferenceNote();
        }
    });

    const edNoteAddBtn = document.getElementById('edition-note-add');
    const edNoteInput = document.getElementById('edition-note-input');
    const handleAddEditionNote = async () => {
        const text = edNoteInput ? edNoteInput.value.trim() : '';
        if (!text) return;
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        await fetch('/api/analytics/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, editionNoteId: cid, editionId: cid })
        });
        if (edNoteInput) edNoteInput.value = '';
        await loadConferenceNotes();
    };
    edNoteAddBtn?.addEventListener('click', (e) => {
        e.preventDefault();
        handleAddEditionNote();
    });
    edNoteInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleAddEditionNote();
        }
    });

    document.getElementById('delete-all-conference-notes')?.addEventListener('click', async (e) => {
        e.preventDefault();
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        if (!cid || !confirm('Delete all conference notes for this conference series? This cannot be undone.')) return;
        await fetch(`/api/analytics/notes/conference/${cid}`, { method: 'DELETE' });
        await loadConferenceNotes();
    });

    document.getElementById('delete-all-edition-notes')?.addEventListener('click', async (e) => {
        e.preventDefault();
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        if (!cid || !confirm('Delete all notes for this edition? This cannot be undone.')) return;
        await fetch(`/api/analytics/notes?editionId=${cid}`, { method: 'DELETE' });
        await loadConferenceNotes();
    });

    document.getElementById('reset-thresholds')?.addEventListener('click', async () => {
        let cid = state.activeConferenceId;
        if (!cid && state.loadedConferences && state.loadedConferences.length > 0) {
            cid = state.loadedConferences[0].id;
        }
        if (!cid) return;
        const list = document.getElementById('alert-thresholds-list');
        const res = await fetch(`/api/analytics/alert-rules?conferenceId=${cid}`);
        if (res.ok) {
            const rules = await res.json();
            for (const r of rules) {
                const inp = list.querySelector(`input[data-key="${r.key}"]`);
                if (inp) inp.value = r.default;
                const chk = list.querySelector(`input[data-enabled="${r.key}"]`);
                if (chk) chk.checked = true;
            }
        }
    });

    if (closeSettingsDrawer) {
        closeSettingsDrawer.addEventListener('click', () => {
            settingsDrawer.classList.remove('open');
            settingsDrawer.classList.add('closed');
        });
    }

    if (settingsForm) {
        settingsForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const submitSettingsBtn = document.getElementById('submit-settings');
            try {
                if (submitSettingsBtn) submitSettingsBtn.disabled = true;
                const is_anonymized = isAnonymizedCheckbox ? isAnonymizedCheckbox.checked : false;
                const decision_editing_enabled = decisionEditingEnabledCheckbox ? decisionEditingEnabledCheckbox.checked : false;

                const res = await fetch('/api/settings', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ is_anonymized, decision_editing_enabled })
                });

                if (res.ok) {
                    await loadDashboardData();
                    settingsDrawer.classList.remove('open');
                    settingsDrawer.classList.add('closed');
                } else {
                    alert('Failed to save settings.');
                }
            } catch (err) {
                console.error('Error saving settings:', err);
                alert('An error occurred while saving settings.');
            } finally {
                if (submitSettingsBtn) submitSettingsBtn.disabled = false;
            }
        });
    }
}
