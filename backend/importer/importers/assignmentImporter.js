const { readWorkbook } = require("../workbookReader");
const { findWorksheet } = require("../../utils/excelHelper");
const mapAssignment = require("../mappers/assignmentMapper");
const assignmentRepository = require("../../repositories/assignmentRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importAssignmentsForSheet(workbook, sheet, conference, isSuperseded = false) {
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
    console.log(`Imported assignments: ${imported}, skipped: ${skipped}`);
}

async function importAssignments(conference) {
    const workbook = await readWorkbook();
    const candidateSheets = [
        "Submission assignment", "Submission assignments", "Submission_assignment",
        "Assignments", "assignments", "Assignment", "assignment"
    ];
    const sheet = findWorksheet(workbook, candidateSheets);
    if (sheet) {
        await importAssignmentsForSheet(workbook, sheet, conference);
        console.log(`Assignments imported successfully from sheet '${sheet.name}'.\n`);
    } else {
        console.log("No assignments sheet found. Skipping.\n");
    }
}

module.exports = importAssignments;
