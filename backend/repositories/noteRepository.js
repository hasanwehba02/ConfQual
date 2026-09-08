const db = require('../config/database');

async function resolveConferenceSeriesId(id, editionId) {
    if (!id && editionId) {
        const ed = await db.query('SELECT conference_id FROM edition WHERE id = $1', [editionId]);
        if (ed.rows.length > 0) return ed.rows[0].conference_id;
    }
    if (!id) return null;
    const parsed = parseInt(id, 10);
    if (isNaN(parsed)) return null;

    const cs = await db.query('SELECT id FROM conference_series WHERE id = $1', [parsed]);
    if (cs.rows.length > 0) return cs.rows[0].id;

    const ed = await db.query('SELECT conference_id FROM edition WHERE id = $1', [parsed]);
    if (ed.rows.length > 0) return ed.rows[0].conference_id;

    return parsed;
}

async function createNote({
    text,
    authorParticipantId,
    editionId,
    paperId,
    participantId,
    conferenceId,
    editionNoteId,
    topicId,
    targetAuthorId,
    researcherId,
    assignmentId,
    reviewId,
    commentId,
    decisionPaperId
}) {
    let resolvedEditionId = editionId;
    if (!resolvedEditionId && editionNoteId) {
        resolvedEditionId = editionNoteId;
    }
    if (!resolvedEditionId && paperId) {
        const p = await db.query('SELECT edition_id FROM paper WHERE id = $1', [paperId]);
        if (p.rows.length > 0 && p.rows[0].edition_id) resolvedEditionId = p.rows[0].edition_id;
    }
    if (!resolvedEditionId && reviewId) {
        const r = await db.query('SELECT p.edition_id FROM review rv JOIN paper p ON p.id = rv.paper_id WHERE rv.id = $1', [reviewId]);
        if (r.rows.length > 0 && r.rows[0].edition_id) resolvedEditionId = r.rows[0].edition_id;
    }
    if (!resolvedEditionId && commentId) {
        const c = await db.query('SELECT p.edition_id FROM comment cm JOIN paper p ON p.id = cm.paper_id WHERE cm.id = $1', [commentId]);
        if (c.rows.length > 0 && c.rows[0].edition_id) resolvedEditionId = c.rows[0].edition_id;
    }
    if (!resolvedEditionId && participantId) {
        const pn = await db.query('SELECT edition_id FROM participant WHERE id = $1', [participantId]);
        if (pn.rows.length > 0 && pn.rows[0].edition_id) resolvedEditionId = pn.rows[0].edition_id;
    }
    if (!resolvedEditionId && conferenceId) {
        const ed = await db.query('SELECT id FROM edition WHERE conference_id = $1 ORDER BY year DESC LIMIT 1', [conferenceId]);
        if (ed.rows.length > 0) resolvedEditionId = ed.rows[0].id;
    }
    if (!resolvedEditionId) {
        const ed = await db.query('SELECT id FROM edition ORDER BY year DESC LIMIT 1');
        resolvedEditionId = ed.rows[0]?.id || 1;
    }

    let resolvedAuthorId = authorParticipantId;
    if (!resolvedAuthorId) {
        const p = await db.query('SELECT id FROM participant WHERE edition_id = $1 LIMIT 1', [resolvedEditionId]);
        if (p.rows.length > 0) {
            resolvedAuthorId = p.rows[0].id;
        } else {
            const pAny = await db.query('SELECT id FROM participant LIMIT 1');
            resolvedAuthorId = pAny.rows[0]?.id || 1;
        }
    }

    const noteRes = await db.query(
        'INSERT INTO note (text, author_participant_id, edition_id) VALUES ($1,$2,$3) RETURNING *',
        [text, resolvedAuthorId, resolvedEditionId]
    );
    const note = noteRes.rows[0];

    if (paperId) {
        await db.query('INSERT INTO paper_note (note_id, paper_id) VALUES ($1,$2)', [note.id, paperId]);
    } else if (participantId) {
        await db.query('INSERT INTO participant_note (note_id, participant_id) VALUES ($1,$2)', [note.id, participantId]);
    } else if (conferenceId) {
        const seriesId = await resolveConferenceSeriesId(conferenceId, editionId);
        await db.query('INSERT INTO conference_note (note_id, conference_id) VALUES ($1,$2)', [note.id, seriesId]);
    } else if (editionNoteId) {
        await db.query('INSERT INTO edition_note (note_id, edition_id) VALUES ($1,$2)', [note.id, editionNoteId]);
    } else if (topicId) {
        await db.query('INSERT INTO topic_note (note_id, topic_id) VALUES ($1,$2)', [note.id, topicId]);
    } else if (targetAuthorId) {
        await db.query('INSERT INTO author_note (note_id, author_participant_id) VALUES ($1,$2)', [note.id, targetAuthorId]);
    } else if (researcherId) {
        await db.query('INSERT INTO researcher_note (note_id, researcher_id) VALUES ($1,$2)', [note.id, researcherId]);
    } else if (assignmentId) {
        await db.query('INSERT INTO assignment_note (note_id, assignment_id) VALUES ($1,$2)', [note.id, assignmentId]);
    } else if (reviewId) {
        await db.query('INSERT INTO review_note (note_id, review_id) VALUES ($1,$2)', [note.id, reviewId]);
    } else if (commentId) {
        await db.query('INSERT INTO comment_note (note_id, comment_id) VALUES ($1,$2)', [note.id, commentId]);
    } else if (decisionPaperId) {
        await db.query('INSERT INTO decision_note (note_id, paper_id) VALUES ($1,$2)', [note.id, decisionPaperId]);
    }

    return note;
}

async function listNotes({
    paperId,
    participantId,
    editionId,
    reviewId,
    commentId,
    conferenceId,
    topicId,
    editionNoteId,
    targetAuthorId,
    researcherId,
    assignmentId,
    decisionPaperId
}) {
    let q = `SELECT n.*,
        pn.paper_id, p.title AS paper_title, p.external_submission_id,
        rn.review_id, cn.comment_id, c.comment_text,
        ptn.participant_id, edn.edition_id AS edition_note_id, tn.topic_id,
        an.author_participant_id, rnn.researcher_id, asn.assignment_id, dn.paper_id AS decision_paper_id,
        cfn.conference_id,
        e.year AS note_edition_year,
        pn_ed.year AS participant_edition_year
        FROM note n
        LEFT JOIN edition e ON e.id = n.edition_id
        LEFT JOIN conference_note cfn ON cfn.note_id=n.id
        LEFT JOIN paper_note pn ON pn.note_id=n.id LEFT JOIN paper p ON p.id=pn.paper_id
        LEFT JOIN review_note rn ON rn.note_id=n.id
        LEFT JOIN comment_note cn ON cn.note_id=n.id LEFT JOIN comment c ON c.id=cn.comment_id
        LEFT JOIN participant_note ptn ON ptn.note_id=n.id LEFT JOIN participant pt ON pt.id=ptn.participant_id LEFT JOIN edition pn_ed ON pn_ed.id=pt.edition_id
        LEFT JOIN edition_note edn ON edn.note_id=n.id
        LEFT JOIN topic_note tn ON tn.note_id=n.id
        LEFT JOIN author_note an ON an.note_id=n.id
        LEFT JOIN researcher_note rnn ON rnn.note_id=n.id
        LEFT JOIN assignment_note asn ON asn.note_id=n.id
        LEFT JOIN decision_note dn ON dn.note_id=n.id
        WHERE 1=1`;
    const vals = [];

    if (paperId) {
        vals.push(paperId);
        q += ` AND pn.paper_id = $${vals.length}`;
    }
    if (participantId) {
        vals.push(participantId);
        q += ` AND ptn.participant_id IN (
            SELECT pt.id FROM participant pt
            JOIN edition ed2 ON ed2.id = pt.edition_id
            WHERE pt.researcher_id = (SELECT researcher_id FROM participant WHERE id=$${vals.length})
              AND ed2.conference_id = (SELECT ed3.conference_id FROM edition ed3 JOIN participant pt3 ON pt3.edition_id=ed3.id WHERE pt3.id=$${vals.length})
        )`;
    }
    if (reviewId) {
        vals.push(reviewId);
        q += ` AND rn.review_id = $${vals.length}`;
    }
    if (commentId) {
        vals.push(commentId);
        q += ` AND cn.comment_id = $${vals.length}`;
    }
    if (editionId && !paperId && !participantId && !reviewId && !commentId && !conferenceId && !topicId && !editionNoteId && !targetAuthorId && !researcherId && !assignmentId && !decisionPaperId) {
        vals.push(editionId);
        q += ` AND n.edition_id = $${vals.length}`;
    } else if (editionId && !conferenceId && !editionNoteId) {
        vals.push(editionId);
        q += ` AND n.edition_id = $${vals.length}`;
    }
    if (conferenceId) {
        const seriesId = await resolveConferenceSeriesId(conferenceId);
        vals.push(seriesId);
        q += ` AND EXISTS (
            SELECT 1 FROM conference_note cn2
            WHERE cn2.note_id = n.id AND cn2.conference_id = $${vals.length}
        )`;
    }
    if (topicId) {
        vals.push(topicId);
        q += ` AND tn.topic_id = $${vals.length}`;
    }
    if (editionNoteId) {
        vals.push(editionNoteId);
        q += ` AND edn.edition_id = $${vals.length}`;
    }
    if (targetAuthorId) {
        vals.push(targetAuthorId);
        q += ` AND an.author_participant_id IN (
            SELECT pt.id FROM participant pt JOIN edition ed2 ON ed2.id=pt.edition_id
            WHERE pt.researcher_id = (SELECT researcher_id FROM participant WHERE id=$${vals.length})
        )`;
    }
    if (researcherId) {
        vals.push(researcherId);
        q += ` AND rnn.researcher_id = $${vals.length}`;
    }
    if (assignmentId) {
        vals.push(assignmentId);
        q += ` AND asn.assignment_id = $${vals.length}`;
    }
    if (decisionPaperId) {
        vals.push(decisionPaperId);
        q += ` AND dn.paper_id = $${vals.length}`;
    }

    q += ` ORDER BY n.created_at ASC`;
    const res = await db.query(q, vals);
    return res.rows;
}

async function getNoteById(id) {
    const res = await db.query('SELECT * FROM note WHERE id = $1', [id]);
    return res.rows[0] || null;
}

async function updateNote(id, text) {
    const res = await db.query(
        'UPDATE note SET text = $1 WHERE id = $2 RETURNING *',
        [text, id]
    );
    return res.rows[0] || null;
}

async function deleteNote(id) {
    const res = await db.query('DELETE FROM note WHERE id = $1 RETURNING *', [id]);
    return res.rows[0] || null;
}

async function deleteNotesByEdition(editionId) {
    const res = await db.query('DELETE FROM note WHERE edition_id = $1 RETURNING *', [editionId]);
    return res.rows;
}

module.exports = {
    createNote,
    listNotes,
    getNoteById,
    updateNote,
    deleteNote,
    deleteNotesByEdition
};
