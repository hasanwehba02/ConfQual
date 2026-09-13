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

async function updateConference(editionId, body = {}) {
    // Route PUT /conferences/:id uses edition id; support both edition fields and series fields
    const { year, submissionDeadline, submission_deadline, name, acronym, shortName, conferenceName } = body;
    let edition;
    if (year !== undefined || submissionDeadline !== undefined || submission_deadline !== undefined) {
        edition = await editionRepository.updateEdition(editionId, {
            year: year != null ? parseInt(year, 10) : undefined,
            submissionDeadline: submissionDeadline || submission_deadline
        });
    } else {
        edition = await editionRepository.getEditionById(editionId);
    }
    if ((name || conferenceName || acronym || shortName) && edition) {
        await editionRepository.updateConferenceSeries(edition.conference_id, {
            name: name || conferenceName,
            acronym: acronym || shortName
        });
        edition = await editionRepository.getEditionById(editionId);
    }
    return edition;
}

module.exports = {
    listConferences,
    getComparisonMetrics,
    deleteConference,
    updateConference
};
