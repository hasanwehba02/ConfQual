const { readWorkbook } = require("../workbookReader");
const mapMetaReview = require("../mappers/metaReviewMapper");
const metaReviewRepository = require("../../repositories/metaReviewRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importMetaReviewsForSheet(workbook, sheetName, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap();
    const pcmMap = await programCommitteeRepository.getIdMap();
    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapMetaReview(row);
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
        imported += await metaReviewRepository.bulkCreateMetaReviews(chunk);
    }
    console.log();
}

async function importMetaReviews() {
    const workbook = await readWorkbook();
    await importMetaReviewsForSheet(workbook, "Meta reviews");
    console.log("metaReview imported successfully.\n");
}

module.exports = importMetaReviews;
