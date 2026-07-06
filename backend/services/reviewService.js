const reviewRepository = require("../repositories/reviewRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createReview(reviewDto) {
    const paper = await paperService.findByExternalSubmissionId(reviewDto.externalSubmissionId);
    if (!paper) return null;

    let pcm = await programCommitteeService.findByExternalPersonId(reviewDto.externalPersonId);
    if (!pcm) {
        // Auto-create sub-reviewer
        pcm = await programCommitteeService.createProgramCommitteeMember({
            conferenceId: paper.conference_id,
            externalPersonId: reviewDto.externalPersonId,
            firstName: reviewDto.reviewerFirstName || 'Unknown',
            lastName: reviewDto.reviewerLastName || 'Unknown',
            email: reviewDto.reviewerEmail || null,
            affiliation: null,
            country: null,
            role: 'Sub-reviewer'
        });
    }
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
        hasAttachment: reviewDto.hasAttachment,
        isSuperseded: reviewDto.isSuperseded || false
    });
}

module.exports = {
    createReview
};
