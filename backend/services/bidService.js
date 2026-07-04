const bidRepository = require("../repositories/bidRepository");
const paperService = require("./paperService");
const programCommitteeService = require("./programCommitteeService");

async function createBid(externalSubmissionId, externalPersonId, bid) {
    const paper = await paperService.findByExternalSubmissionId(externalSubmissionId);
    if (!paper) return null;

    const pcm = await programCommitteeService.findByExternalPersonId(externalPersonId);
    if (!pcm) return null;

    return await bidRepository.createBid({
        paperId: paper.id,
        programCommitteeMemberId: pcm.id,
        bid: bid
    });
}

module.exports = {
    createBid
};
