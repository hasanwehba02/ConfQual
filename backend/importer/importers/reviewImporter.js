const { readWorkbook } = require("../workbookReader");
const mapReview = require("../mappers/reviewMapper");
const reviewRepository = require("../../repositories/reviewRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");
const analyticsMath = require("../../utils/analyticsMath");

async function importReviewsForSheet(workbook, sheetName, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap();
    const pcmMap = await programCommitteeRepository.getIdMap();
    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapReview(row);
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
        dto.isSuperseded = isSuperseded;
        dto.sentimentScore = analyticsMath.analyzeReviewSentiment(dto.reviewText);
        dtos.push(dto);
    }
    const chunkSize = 200;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await reviewRepository.batchCreateReviews(chunk);
        imported += results.length;
    }
    console.log();
}

async function importReviews() {
    const workbook = await readWorkbook();
    await importReviewsForSheet(workbook, "Reviews", false);
    await importReviewsForSheet(workbook, "Superseded reviews", true);
    console.log("review imported successfully.\n");
}

module.exports = importReviews;
