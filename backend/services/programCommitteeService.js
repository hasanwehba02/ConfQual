const programCommitteeRepository = require("../repositories/programCommitteeRepository");

async function createProgramCommitteeMember(member) {
    return await programCommitteeRepository.createProgramCommitteeMember(member);
}

module.exports = {
    createProgramCommitteeMember
};