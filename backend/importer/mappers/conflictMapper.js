const { extractValue } = require('../../utils/excelHelper');

function mapConflict(row) {
    return {
        externalPersonId: extractValue(row.getCell(1)),
        externalSubmissionId: extractValue(row.getCell(2))
    };
}

module.exports = mapConflict;
