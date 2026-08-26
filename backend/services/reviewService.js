const reviewRepository = require("../repositories/reviewRepository");
const paperRepository = require("../repositories/paperRepository");
const programCommitteeRepository = require("../repositories/programCommitteeRepository");

async function createReview(reviewDto) {
    const paper = await paperRepository.findByExternalSubmissionId(reviewDto.externalSubmissionId);
    if (!paper) return null;

    const isSubReviewer = !!reviewDto.subReviewerPersonId;
    const actualReviewerId = isSubReviewer ? reviewDto.subReviewerPersonId : reviewDto.externalPersonId;
    
    let pcm = await programCommitteeRepository.findByExternalPersonId(actualReviewerId);
    if (!pcm) {
        let firstName = 'Unknown';
        let lastName = 'Unknown';
        let email = null;
        
        if (isSubReviewer) {
            // Shorten anonymized Excel names, e.g. "NomSubreviewer123" -> "Subnom123"
            firstName = (reviewDto.subReviewerFirstName || 'Unknown').replace('NomSubreviewer', 'Subnom');
            lastName = (reviewDto.subReviewerLastName || 'Unknown').replace('CognomSubreviewer', 'Cognom');
            email = reviewDto.subReviewerEmail || null;
        } else {
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

        pcm = await programCommitteeRepository.createProgramCommitteeMember({
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
