import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import db from '../config/database.js';
import noteRepo from '../repositories/noteRepository.js';

describe('Note Scoping and CRUD Repository Tests', () => {
    let confSeriesA, confSeriesB;
    let editionA2025, editionA2026, editionB2025;
    let researcherId;
    let participantA2025, participantA2026;

    before(async () => {
        // Setup isolated test conference series and editions
        const csA = await db.query(
            "INSERT INTO conference_series (name, acronym) VALUES ('Test Conf A ' || random(), 'TCA') RETURNING id"
        );
        confSeriesA = csA.rows[0].id;

        const csB = await db.query(
            "INSERT INTO conference_series (name, acronym) VALUES ('Test Conf B ' || random(), 'TCB') RETURNING id"
        );
        confSeriesB = csB.rows[0].id;

        const edA1 = await db.query(
            "INSERT INTO edition (conference_id, year) VALUES ($1, 2025) RETURNING id",
            [confSeriesA]
        );
        editionA2025 = edA1.rows[0].id;

        const edA2 = await db.query(
            "INSERT INTO edition (conference_id, year) VALUES ($1, 2026) RETURNING id",
            [confSeriesA]
        );
        editionA2026 = edA2.rows[0].id;

        const edB1 = await db.query(
            "INSERT INTO edition (conference_id, year) VALUES ($1, 2025) RETURNING id",
            [confSeriesB]
        );
        editionB2025 = edB1.rows[0].id;

        const res = await db.query(
            "INSERT INTO researcher (first_name, last_name, email) VALUES ('Test', 'User', 'test-' || random() || '@example.com') RETURNING id"
        );
        researcherId = res.rows[0].id;

        const pA1 = await db.query(
            "INSERT INTO participant_new (researcher_id, edition_id) VALUES ($1, $2) RETURNING id",
            [researcherId, editionA2025]
        );
        participantA2025 = pA1.rows[0].id;

        const pA2 = await db.query(
            "INSERT INTO participant_new (researcher_id, edition_id) VALUES ($1, $2) RETURNING id",
            [researcherId, editionA2026]
        );
        participantA2026 = pA2.rows[0].id;
    });

    after(async () => {
        try {
            const editionIds = [editionA2025, editionA2026, editionB2025].filter(Boolean);
            if (editionIds.length > 0) {
                await db.query("DELETE FROM note WHERE edition_id = ANY($1)", [editionIds]);
            }
            const confIds = [confSeriesA, confSeriesB].filter(Boolean);
            if (confIds.length > 0) {
                await db.query("DELETE FROM conference_series WHERE id = ANY($1)", [confIds]);
            }
            if (researcherId) {
                await db.query("DELETE FROM researcher WHERE id = $1", [researcherId]);
            }
        } catch (err) {
            console.error("Cleanup error in noteScopingAndCrud.test.mjs:", err);
        }
    });

    test('Conference series notes are scoped to the specific conference series', async () => {
        const noteA = await noteRepo.createNote({
            text: 'Conference series note for A',
            authorParticipantId: participantA2025,
            editionId: editionA2025,
            conferenceId: confSeriesA
        });

        // Querying for Series A should return the note
        const notesA = await noteRepo.listNotes({ conferenceId: confSeriesA });
        assert.ok(notesA.some(n => n.id === noteA.id), 'Note should be found for Series A');

        // Querying for Series B should NOT return the note
        const notesB = await noteRepo.listNotes({ conferenceId: confSeriesB });
        assert.ok(!notesB.some(n => n.id === noteA.id), 'Note should not be found for Series B');
    });

    test('Edition notes are scoped to the specific edition', async () => {
        const noteEd2025 = await noteRepo.createNote({
            text: 'Edition 2025 note for A',
            authorParticipantId: participantA2025,
            editionId: editionA2025,
            editionNoteId: editionA2025
        });

        // Querying for edition 2025 should return the note
        const notes2025 = await noteRepo.listNotes({ editionNoteId: editionA2025 });
        assert.ok(notes2025.some(n => n.id === noteEd2025.id), 'Note should be found for Edition 2025');

        // Querying for edition 2026 or B 2025 should NOT return the note
        const notes2026 = await noteRepo.listNotes({ editionNoteId: editionA2026 });
        assert.ok(!notes2026.some(n => n.id === noteEd2025.id), 'Note should not be found for Edition 2026');

        const notesB2025 = await noteRepo.listNotes({ editionNoteId: editionB2025 });
        assert.ok(!notesB2025.some(n => n.id === noteEd2025.id), 'Note should not be found for Edition B 2025');
    });

    test('Updating a note modifies the text correctly', async () => {
        const note = await noteRepo.createNote({
            text: 'Original Text Before Update',
            authorParticipantId: participantA2025,
            editionId: editionA2025,
            editionNoteId: editionA2025
        });

        const updated = await noteRepo.updateNote(note.id, 'Updated Text After Edit');
        assert.equal(updated.text, 'Updated Text After Edit');

        const listed = await noteRepo.listNotes({ editionNoteId: editionA2025 });
        const found = listed.find(n => n.id === note.id);
        assert.ok(found, 'Updated note should still exist');
        assert.equal(found.text, 'Updated Text After Edit');
    });

    test('Deleting a note removes it from the database', async () => {
        const note = await noteRepo.createNote({
            text: 'Text To Delete',
            authorParticipantId: participantA2025,
            editionId: editionA2025,
            editionNoteId: editionA2025
        });

        await noteRepo.deleteNote(note.id);
        const listed = await noteRepo.listNotes({ editionNoteId: editionA2025 });
        assert.ok(!listed.some(n => n.id === note.id), 'Deleted note should not be returned');
    });

    test('Deleting notes by edition removes all notes for that edition', async () => {
        const note1 = await noteRepo.createNote({
            text: 'Edition 2026 Note 1',
            authorParticipantId: participantA2026,
            editionId: editionA2026,
            editionNoteId: editionA2026
        });
        const note2 = await noteRepo.createNote({
            text: 'Edition 2026 Note 2',
            authorParticipantId: participantA2026,
            editionId: editionA2026,
            editionNoteId: editionA2026
        });

        // Ensure both notes are present initially
        let listed2026 = await noteRepo.listNotes({ editionNoteId: editionA2026 });
        assert.ok(listed2026.some(n => n.id === note1.id));
        assert.ok(listed2026.some(n => n.id === note2.id));

        // Delete notes by edition
        await noteRepo.deleteNotesByEdition(editionA2026);

        listed2026 = await noteRepo.listNotes({ editionNoteId: editionA2026 });
        assert.ok(!listed2026.some(n => n.id === note1.id));
        assert.ok(!listed2026.some(n => n.id === note2.id));
    });
});
