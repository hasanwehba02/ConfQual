const { readWorkbook } = require("../workbookReader");
const mapReview = require("../mappers/reviewMapper");
const reviewService = require("../../services/reviewService");
const analyticsMath = require("../../utils/analyticsMath");

async function importReviewsForSheet(workbook, sheetName, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);

    if (!sheet) {
        console.log(`Sheet '${sheetName}' not found. Skipping.`);
        return;
    }

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const reviewDto = mapReview(row);

        if (!reviewDto.externalSubmissionId || !reviewDto.externalPersonId) {
            skipped++;
            continue;
        }

        reviewDto.isSuperseded = isSuperseded;
        
        // Calculate sentiment score using the utility
        reviewDto.sentimentScore = analyticsMath.analyzeReviewSentiment(reviewDto.reviewText);
        dtos.push(reviewDto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => reviewService.createReview(dto))
        );
        for (const savedReview of results) {
            if (savedReview) imported++;
            else skipped++;
        }
    }

    console.log(`Imported ${sheetName}: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
}

async function importReviews() {
    const workbook = await readWorkbook();
    
    await importReviewsForSheet(workbook, "Reviews", false);
    await importReviewsForSheet(workbook, "Superseded reviews", true);

    console.log("Reviews imported successfully.\n");
}

module.exports = importReviews;
