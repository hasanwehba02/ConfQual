const { extractValue } = require('../../utils/excelHelper');

function mapBid(row) {
    return {
        externalPersonId: extractValue(row.getCell(1)),
        externalSubmissionId: extractValue(row.getCell(2)),
        bid: extractValue(row.getCell(3))
    };
}

module.exports = mapBid;
