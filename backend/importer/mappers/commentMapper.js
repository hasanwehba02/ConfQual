const { extractValue } = require('../../utils/excelHelper');

function mapComment(row) {
    return {
        externalSubmissionId: extractValue(row.getCell(1)),
        externalPersonId: extractValue(row.getCell(2)),
        commentText: extractValue(row.getCell(4)),
        commentDate: extractValue(row.getCell(5)),
        commentTime: extractValue(row.getCell(6))
    };
}

module.exports = mapComment;
