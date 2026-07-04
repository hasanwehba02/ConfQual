function mapComment(row) {
    return {
        externalSubmissionId: row.getCell(1).value,
        externalPersonId: row.getCell(2).value,
        commentText: row.getCell(4).value,
        commentDate: row.getCell(5).value,
        commentTime: row.getCell(6).value
    };
}

module.exports = mapComment;
