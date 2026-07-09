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

    for (let i = 2; i <= metaReviewsSheet.rowCount; i++) {
        const row = metaReviewsSheet.getRow(i);
        const metaReviewDto = mapMetaReview(row, headerMap);

        if (!metaReviewDto.externalSubmissionId || !metaReviewDto.externalPersonId) {
            skipped++;
            continue;
        }

        const savedMetaReview = await metaReviewService.createMetaReview(metaReviewDto);

        if (savedMetaReview) {
            imported++;
        } else {
            skipped++;
        }
    }

    console.log(`Imported metareviews: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Metareviews imported successfully.\n");
}

module.exports = importMetaReviews;
