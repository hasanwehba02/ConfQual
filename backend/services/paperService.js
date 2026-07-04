const paperRepository = require("../repositories/paperRepository");

async function createPaper(paper) {
    return await paperRepository.createPaper(paper);
}

async function findByExternalSubmissionId(externalSubmissionId) {
    return await paperRepository.findByExternalSubmissionId(
        externalSubmissionId
    );
}

module.exports = {
    createPaper,
    findByExternalSubmissionId
};