const { readWorkbook } = require("../workbookReader");
const mapComment = require("../mappers/commentMapper");
const commentRepository = require("../../repositories/commentRepository");
const paperRepository = require("../../repositories/paperRepository");
const participantRepository = require("../../repositories/participantRepository");

async function importCommentsForSheet(workbook, sheetName, edition) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap(edition.id);
    const participantMap = await participantRepository.getParticipantIdMap(edition.id);
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
        dto.participantId = participantMap[dto.externalPersonId];
        if (!dto.paperId || !dto.participantId) {
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
    console.log(`Imported comments: ${imported}, skipped: ${skipped}`);
}

async function importComments(edition) {
    const workbook = await readWorkbook();
    await importCommentsForSheet(workbook, "Comments", edition);
    console.log("Comment imported successfully.\n");
}

module.exports = importComments;
