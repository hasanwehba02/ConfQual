const commentRepository = require("../repositories/commentRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createComment(commentDto) {
    const paper = await paperService.findByExternalSubmissionId(commentDto.externalSubmissionId);
    if (!paper) return null;

    const pcm = await programCommitteeService.findByExternalPersonId(commentDto.externalPersonId);
    if (!pcm) return null;

    return await commentRepository.createComment({
        paperId: paper.id,
        programCommitteeMemberId: pcm.id,
        commentText: commentDto.commentText,
        commentDate: commentDto.commentDate,
        commentTime: commentDto.commentTime
    });
}

module.exports = {
    createComment
};
