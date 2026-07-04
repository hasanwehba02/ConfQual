const assignmentRepository = require("../repositories/assignmentRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createAssignment(externalSubmissionId, externalPersonId) {
    const paper = await paperService.findByExternalSubmissionId(externalSubmissionId);
    if (!paper) return null;

    const pcm = await programCommitteeService.findByExternalPersonId(externalPersonId);
    if (!pcm) return null;

    return await assignmentRepository.createAssignment({
        paperId: paper.id,
        programCommitteeMemberId: pcm.id
    });
}

module.exports = {
    createAssignment
};
