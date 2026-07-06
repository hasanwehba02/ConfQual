const programCommitteeRepository = require("../repositories/programCommitteeRepository");

async function createProgramCommitteeMember(member) {
    return await programCommitteeRepository.createProgramCommitteeMember(member);
}

async function findByExternalPersonId(externalPersonId) {
    return await programCommitteeRepository.findByExternalPersonId(externalPersonId);
}

module.exports = {
    createProgramCommitteeMember,
    findByExternalPersonId
};