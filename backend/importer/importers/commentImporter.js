const { readWorkbook } = require("../workbookReader");
const mapComment = require("../mappers/commentMapper");
const commentRepository = require("../../repositories/commentRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importCommentsForSheet(workbook, sheetName, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap();
    const pcmMap = await programCommitteeRepository.getIdMap();
    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapComment(row);
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
        imported += await commentRepository.bulkCreateComments(chunk);
    }
    console.log();
}

async function importComments() {
    const workbook = await readWorkbook();
    await importCommentsForSheet(workbook, "Comments");
    console.log("comment imported successfully.\n");
}

module.exports = importComments;
