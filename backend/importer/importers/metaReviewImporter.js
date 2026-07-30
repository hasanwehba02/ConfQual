const { readWorkbook } = require("../workbookReader");
const mapMetaReview = require("../mappers/metaReviewMapper");
const metaReviewService = require("../../services/metaReviewService");

async function importMetaReviews() {
    const workbook = await readWorkbook();
    const metaReviewsSheet = workbook.getWorksheet("Metareviews");

    if (!metaReviewsSheet) {
        console.log("Metareviews sheet not found. Skipping.");
        return;
    }

    let imported = 0;
    let skipped = 0;

    const headerRow = metaReviewsSheet.getRow(1);
    const headerMap = {};
    headerRow.eachCell((cell, colNumber) => {
        if (cell.value) {
            headerMap[cell.value.toString().toLowerCase()] = colNumber;
        }
    });

    const dtos = [];
    for (let i = 2; i <= metaReviewsSheet.rowCount; i++) {
        const row = metaReviewsSheet.getRow(i);
        const metaReviewDto = mapMetaReview(row, headerMap);

        if (!metaReviewDto.externalSubmissionId || !metaReviewDto.externalPersonId) {
            skipped++;
            continue;
        }
        dtos.push(metaReviewDto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => metaReviewService.createMetaReview(dto))
        );
        for (const savedMetaReview of results) {
            if (savedMetaReview) imported++;
            else skipped++;
        }
    }

    console.log(`Imported metareviews: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Metareviews imported successfully.\n");
}

module.exports = importMetaReviews;
