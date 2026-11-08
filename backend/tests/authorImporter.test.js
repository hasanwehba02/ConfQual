const test = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const workbookReader = require('../importer/workbookReader');
const researchers = require('../repositories/researcherRepository');
const participants = require('../repositories/participantRepository');
const papers = require('../repositories/paperRepository');
const paperAuthors = require('../repositories/paperAuthorRepository');

test('author import counts each skipped row once', async (t) => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Authors');
    sheet.addRow(['Submission #', 'First name', 'Last name', 'Email', 'Country', 'Affiliation', 'Person #']);
    sheet.addRow([42, 'Valid', 'Author', 'valid@example.com', 'US', 'Example', 7]);
    sheet.addRow([42, 'Missing', 'Person', 'missing@example.com', 'US', 'Example', null]);
    sheet.addRow([42, 'Missing', 'Researcher', 'unresolved@example.com', 'US', 'Example', 8]);

    t.mock.method(workbookReader, 'readWorkbook', async () => workbook);
    t.mock.method(papers, 'getIdMap', async () => ({ 42: 10 }));
    t.mock.method(researchers, 'bulkFindOrCreateResearchers', async () => new Map([[0, { id: 12 }]]));
    t.mock.method(participants, 'bulkFindOrCreateParticipants', async (items) => new Map([[items[0].externalPersonId, { id: 20 }]]));
    t.mock.method(participants, 'bulkCreateAuthorParticipants', async () => 1);
    const saveRelations = t.mock.method(paperAuthors, 'bulkCreatePaperAuthors', async (relations) => relations.length);
    const logs = t.mock.method(console, 'log', () => {});
    const importAuthors = require('../importer/importers/authorImporter');

    await importAuthors({ id: 1 });

    assert.deepEqual(saveRelations.mock.calls[0].arguments[0], [
        { paperId: 10, participantId: 20, authorOrder: 1, corresponding: false }
    ]);
    assert.ok(logs.mock.calls.some(({ arguments: args }) => args[0] === 'Skipped rows: 2'));
});
