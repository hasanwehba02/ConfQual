const { readWorkbook } = require("../workbookReader");
const mapConflict = require("../mappers/conflictMapper");
const conflictRepository = require("../../repositories/conflictRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importConflictsForSheet(workbook, sheetName, conference, _isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap(conference.id);
    const pcmMap = await programCommitteeRepository.getIdMap(conference.id);
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
        dto.programCommitteeMemberId = pcmMap[dto.externalPersonId];
        if (!dto.paperId || !dto.programCommitteeMemberId) {
            skipped++;
            continue;
        }
        dtos.push(dto);
    }
    const chunkSize = 200;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        imported += await conflictRepository.bulkCreateConflicts(chunk);
    }
    console.log(`Imported conflicts: ${imported}`);
    console.log(`Skipped conflict rows: ${skipped}`);
}

async function importConflicts(conference) {
    const workbook = await readWorkbook();
    const candidateSheets = ["Conflicts of interest", "Conflicts of interests", "Conflicts", "conflicts", "Conflict", "conflicts of interest", "conflicts of interests"];
    const sheetName = candidateSheets.find(name => workbook.getWorksheet(name));
    if (sheetName) {
        await importConflictsForSheet(workbook, sheetName, conference);
        console.log(`Conflicts imported successfully from sheet '${sheetName}'.\n`);
    } else {
        console.log("No conflicts sheet found. Skipping.\n");
    }
}

module.exports = importConflicts;
