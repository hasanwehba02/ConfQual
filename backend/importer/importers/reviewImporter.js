const { readWorkbook } = require("../workbookReader");
const mapReview = require("../mappers/reviewMapper");
const reviewRepository = require("../../repositories/reviewRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");
const analyticsMath = require("../../utils/analyticsMath");

async function importReviewsForSheet(workbook, sheetName, conference, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap(conference.id);
    const pcmMap = await programCommitteeRepository.getIdMap(conference.id);
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
        
        // Add sub-reviewer to program committee if they don't exist
        if (dto.subReviewerPersonId && !pcmMap[dto.subReviewerPersonId]) {
            const member = {
                conferenceId: conference.id,
                externalPersonId: dto.subReviewerPersonId,
                firstName: dto.subReviewerFirstName || '',
                lastName: dto.subReviewerLastName || '',
                email: dto.subReviewerEmail || '',
                affiliation: '',
                country: '',
                role: 'Sub-reviewer'
            };
            const savedMember = await programCommitteeRepository.createProgramCommitteeMember(member);
            if (savedMember) {
                pcmMap[dto.subReviewerPersonId] = savedMember.id;
            }
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
    console.log(`Imported reviews: ${imported}, skipped: ${skipped}`);
}

async function importReviews(conference) {
    const workbook = await readWorkbook();
    await importReviewsForSheet(workbook, "Reviews", conference, false);
    await importReviewsForSheet(workbook, "Superseded reviews", conference, true);
    console.log("review imported successfully.\n");
}

module.exports = importReviews;
