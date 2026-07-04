const conflictRepository = require("../repositories/conflictRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createConflict(externalSubmissionId, externalPersonId) {
    const paper = await paperService.findByExternalSubmissionId(externalSubmissionId);
    if (!paper) return null;

    const pcm = await programCommitteeService.findByExternalPersonId(externalPersonId);
    if (!pcm) return null;

    return await conflictRepository.createConflict({
        paperId: paper.id,
        programCommitteeMemberId: pcm.id
    });
}

module.exports = {
    createConflict
};
