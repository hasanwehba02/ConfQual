const reviewRepository = require("../repositories/reviewRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createReview(reviewDto) {
    const paper = await paperService.findByExternalSubmissionId(reviewDto.externalSubmissionId);
    if (!paper) return null;

    const isSubReviewer = !!reviewDto.subReviewerPersonId;
    const actualReviewerId = isSubReviewer ? reviewDto.subReviewerPersonId : reviewDto.externalPersonId;
    
    let pcm = await programCommitteeService.findByExternalPersonId(actualReviewerId);
    if (!pcm) {
        let firstName = 'Unknown';
        let lastName = 'Unknown';
        let email = null;
        
        if (isSubReviewer) {
            firstName = (reviewDto.subReviewerFirstName || 'Unknown').replace('NomSubreviewer', 'NomSub');
            lastName = (reviewDto.subReviewerLastName || 'Unknown').replace('CognomSubreviewer', 'CogSub');
            email = reviewDto.subReviewerEmail || null;
        } else {
            // It's the primary member but missing from PC sheet. Parse their name from memberName.
            const nameStr = (reviewDto.memberName || '').trim();
            if (nameStr) {
                if (nameStr.toLowerCase().startsWith('reviewer')) {
                    firstName = 'Nom' + actualReviewerId;
                    lastName = 'Cognom' + actualReviewerId;
                } else {
                    const nameParts = nameStr.split(' ');
                    firstName = nameParts[0] || 'Unknown';
                    lastName = nameParts.slice(1).join(' ') || 'Unknown';
                    if (lastName === 'Unknown' && firstName !== 'Unknown') lastName = '';
                }
            }
        }

        // Auto-create missing reviewer
        pcm = await programCommitteeService.createProgramCommitteeMember({
            conferenceId: paper.conference_id,
            externalPersonId: actualReviewerId,
            firstName: firstName,
            lastName: lastName,
            email: email,
            affiliation: null,
            country: null,
            role: isSubReviewer ? 'Sub-reviewer' : 'PC member'
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
