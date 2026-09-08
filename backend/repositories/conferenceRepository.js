const editionRepository = require("./editionRepository");

async function listConferences() {
    return await editionRepository.listEditions();
}

async function getComparisonMetrics() {
    return await editionRepository.getComparisonMetrics();
}

async function deleteConference(editionId) {
    return await editionRepository.deleteEdition(editionId);
}

module.exports = {
    listConferences,
    getComparisonMetrics,
    deleteConference
};
