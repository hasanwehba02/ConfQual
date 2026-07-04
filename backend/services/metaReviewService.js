const metaReviewRepository = require("../repositories/metaReviewRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createMetaReview(metaReviewDto) {
    const paper = await paperService.findByExternalSubmissionId(metaReviewDto.externalSubmissionId);
    if (!paper) return null;

    const pcm = await programCommitteeService.findByExternalPersonId(metaReviewDto.externalPersonId);
    if (!pcm) return null;

    return await metaReviewRepository.createMetaReview({
        paperId: paper.id,
        programCommitteeMemberId: pcm.id,
        recommendation: metaReviewDto.recommendation,
        reviewText: metaReviewDto.reviewText,
        reviewDate: metaReviewDto.reviewDate,
        reviewTime: metaReviewDto.reviewTime
    });
}

module.exports = {
    createMetaReview
};
