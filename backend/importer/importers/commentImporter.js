const { readWorkbook } = require("../workbookReader");
const mapComment = require("../mappers/commentMapper");
const commentRepository = require("../../repositories/commentRepository");
const paperRepository = require("../../repositories/paperRepository");
const participantRepository = require("../../repositories/participantRepository");

async function importCommentsForSheet(workbook, sheetName, edition, context = {}) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = context.paperMap ?? await paperRepository.getIdMap(edition.id);
    const participantMap = context.participantMap ?? await participantRepository.getParticipantIdMap(edition.id);
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
    const chunkSize = 500;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        imported += await commentRepository.bulkCreateComments(chunk);
    }
    console.log(`Imported comments: ${imported}, skipped: ${skipped}`);
}

async function importComments(edition, context = {}) {
    const workbook = await readWorkbook();
    await importCommentsForSheet(workbook, "Comments", edition, context);
    console.log("Comment imported successfully.\n");
}

module.exports = importComments;
