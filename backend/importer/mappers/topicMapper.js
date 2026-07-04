function mapPcTopic(row) {
    return {
        externalPersonId: row.getCell(1).value,
        topicName: row.getCell(3).value
    };
}

function mapSubmissionTopic(row) {
    return {
        externalSubmissionId: row.getCell(1).value,
        topicName: row.getCell(2).value
    };
}

module.exports = {
    mapPcTopic,
    mapSubmissionTopic
};
