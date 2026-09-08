const reviewRepository = require("../repositories/reviewRepository");
const paperRepository = require("../repositories/paperRepository");
const participantRepository = require("../repositories/participantRepository");

async function createReview(reviewDto) {
    const paper = await paperRepository.findByExternalSubmissionId(reviewDto.externalSubmissionId);
    if (!paper) return null;

    const isSubReviewer = !!reviewDto.subReviewerPersonId;
    const actualReviewerId = isSubReviewer ? reviewDto.subReviewerPersonId : reviewDto.externalPersonId;

    let participant = await participantRepository.findOrCreateParticipant({
        externalPersonId: actualReviewerId,
        editionId: paper.edition_id,
        researcherId: null // Will be resolved inside findOrCreateParticipant
    });

    if (!participant) return null;

    return await reviewRepository.createReview({
        paperId: paper.id,
        participantId: participant.id,
        reviewNumber: reviewDto.reviewNumber,
        version: reviewDto.version,
        reviewText: reviewDto.reviewText,
        scores: reviewDto.scores,
        totalScore: reviewDto.totalScore,
        reviewDate: reviewDto.reviewDate,
        reviewTime: reviewDto.reviewTime,
        hasAttachment: reviewDto.hasAttachment,
        isSuperseded: reviewDto.isSuperseded || false,
        sentimentScore: reviewDto.sentimentScore,
        subReviewerPersonId: reviewDto.subReviewerPersonId,
        subReviewerFirstName: reviewDto.subReviewerFirstName,
        subReviewerLastName: reviewDto.subReviewerLastName,
        subReviewerEmail: reviewDto.subReviewerEmail
    });
}

module.exports = {
    createReview
};
