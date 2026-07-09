const { extractValue } = require('../../utils/excelHelper');

function mapAssignment(row) {
    return {
        externalPersonId: extractValue(row.getCell(1)),
        externalSubmissionId: extractValue(row.getCell(2))
    };
}

module.exports = mapAssignment;
