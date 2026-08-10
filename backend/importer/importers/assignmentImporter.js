const { readWorkbook } = require("../workbookReader");
const mapAssignment = require("../mappers/assignmentMapper");
const assignmentRepository = require("../../repositories/assignmentRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importAssignmentsForSheet(workbook, sheetName, conference, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap(conference.id);
    const pcmMap = await programCommitteeRepository.getIdMap(conference.id);
    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapAssignment(row);
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
        imported += await assignmentRepository.bulkCreateAssignments(chunk);
    }
    console.log();
}

async function importAssignments(conference) {
    const workbook = await readWorkbook();
    await importAssignmentsForSheet(workbook, "Submission assignment", conference);
    console.log("assignment imported successfully.\n");
}

module.exports = importAssignments;
