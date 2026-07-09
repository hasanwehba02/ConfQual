const { extractValue } = require('../../utils/excelHelper');

function mapPcTopic(row) {
    return {
        externalPersonId: extractValue(row.getCell(1)),
        topicName: extractValue(row.getCell(3))
    };
}

function mapSubmissionTopic(row) {
    return {
        externalSubmissionId: extractValue(row.getCell(1)),
        topicName: extractValue(row.getCell(2))
    };
}

module.exports = {
    mapPcTopic,
    mapSubmissionTopic
};
