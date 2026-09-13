const { readWorkbook } = require("../workbookReader");
const mapReview = require("../mappers/reviewMapper");
const reviewRepository = require("../../repositories/reviewRepository");
const paperRepository = require("../../repositories/paperRepository");
const participantRepository = require("../../repositories/participantRepository");
const { batchAnalyzeReviewSentiment } = require("../../utils/analyticsMath");

async function importReviewsForSheet(workbook, sheetName, edition, isSuperseded = false, context = {}) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = context.paperMap ?? await paperRepository.getIdMap(edition.id);
    const participantMap = context.participantMap ?? await participantRepository.getParticipantIdMap(edition.id);
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
        dto.participantId = participantMap[dto.externalPersonId];
        if (!dto.paperId || !dto.participantId) {
            skipped++;
            continue;
        }

        // Add sub-reviewer if they don't exist as a participant
        if (dto.subReviewerPersonId && !participantMap[dto.subReviewerPersonId]) {
            try {
                const researcher = await require("../../repositories/researcherRepository").findOrCreateResearcher({
                    firstName: dto.subReviewerFirstName || '',
                    lastName: dto.subReviewerLastName || '',
                    email: dto.subReviewerEmail || '',
                    affiliation: '',
                    country: ''
                });

                const participant = await participantRepository.findOrCreateParticipant({
                    researcherId: researcher.id,
                    editionId: edition.id,
                    externalPersonId: dto.subReviewerPersonId
                });

                if (participant) {
                    participantMap[dto.subReviewerPersonId] = participant.id;
                }
            } catch (err) {
                console.warn(`Could not create sub-reviewer participant: ${err.message}`);
            }
        }

        dto.isSuperseded = isSuperseded;
        dtos.push(dto);
    }

    if (dtos.length > 0 && !context.deferSentiment) {
        // Fast batched transformer sentiment analysis — deferred in runImporter for HTTP speed
        const sentimentScores = await batchAnalyzeReviewSentiment(dtos.map(d => d.reviewText || ''));
        for (let idx = 0; idx < dtos.length; idx++) {
            dtos[idx].sentimentScore = sentimentScores[idx] || 0;
        }
    } else if (dtos.length > 0) {
        for (const d of dtos) d.sentimentScore = 0;
    }

    const chunkSize = 500;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await reviewRepository.batchCreateReviews(chunk);
        imported += results.length;
    }
    console.log(`Imported reviews: ${imported}, skipped: ${skipped}`);
}

async function importReviews(edition, context = {}) {
    const workbook = await readWorkbook();
    await importReviewsForSheet(workbook, "Reviews", edition, false, context);
    await importReviewsForSheet(workbook, "Superseded reviews", edition, true, context);
    console.log("Review imported successfully.\n");
}

module.exports = importReviews;
