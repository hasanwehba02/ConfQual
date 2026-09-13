const { readWorkbook } = require("../workbookReader");
const { findWorksheet } = require("../../utils/excelHelper");
const mapConflict = require("../mappers/conflictMapper");
const conflictRepository = require("../../repositories/conflictRepository");
const paperRepository = require("../../repositories/paperRepository");
const participantRepository = require("../../repositories/participantRepository");

async function importConflictsForSheet(workbook, sheet, edition, context = {}) {
    if (!sheet) return;
    const paperMap = context.paperMap ?? await paperRepository.getIdMap(edition.id);
    const participantMap = context.participantMap ?? await participantRepository.getParticipantIdMap(edition.id);
    const headerMap = {};
    sheet.getRow(1).eachCell((cell, colNumber) => {
        if (cell.value) {
            headerMap[String(cell.value).trim().toLowerCase()] = colNumber;
        }
    });

    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapConflict(row, headerMap);
        if (!dto.externalSubmissionId || !dto.externalPersonId) {
            skipped++;
            continue;
        }
        dto.paperId = paperMap[dto.externalSubmissionId];
        dto.participantId = participantMap[dto.externalPersonId];
        if (!dto.paperId || !dto.participantId) {
            skipped++;
            continue;
        }
        dtos.push(dto);
    }
    const chunkSize = 500;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        imported += await conflictRepository.bulkCreateConflicts(chunk);
    }
    console.log(`Imported conflicts: ${imported}`);
    console.log(`Skipped conflict rows: ${skipped}`);
}

async function importConflicts(edition, context = {}) {
    const workbook = await readWorkbook();
    const candidateSheets = [
        "Conflicts of interest", "Conflicts of interests", "Conflicts_of_interest",
        "Conflicts", "conflicts", "Conflict", "conflict"
    ];
    const sheet = findWorksheet(workbook, candidateSheets);
    if (sheet) {
        await importConflictsForSheet(workbook, sheet, edition, context);
        console.log(`Conflicts imported successfully from sheet '${sheet.name}'.\n`);
    } else {
        console.log("No conflicts sheet found. Skipping.\n");
    }
}

module.exports = importConflicts;
