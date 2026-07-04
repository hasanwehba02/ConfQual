const reviewRepository = require("../repositories/reviewRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createReview(reviewDto) {
    const paper = await paperService.findByExternalSubmissionId(reviewDto.externalSubmissionId);
    if (!paper) return null;

    const pcm = await programCommitteeService.findByExternalPersonId(reviewDto.externalPersonId);
    if (!pcm) return null;

    return await reviewRepository.createReview({
        paperId: paper.id,
        programCommitteeMemberId: pcm.id,
        reviewNumber: reviewDto.reviewNumber,
        version: reviewDto.version,
        reviewText: reviewDto.reviewText,
        scores: reviewDto.scores,
        totalScore: reviewDto.totalScore,
        reviewDate: reviewDto.reviewDate,
        reviewTime: reviewDto.reviewTime,
        hasAttachment: reviewDto.hasAttachment
    });
}

module.exports = {
    createReview
};
