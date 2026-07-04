function mapMetaReview(row) {
    return {
        externalSubmissionId: row.getCell(1).value,
        externalPersonId: row.getCell(2).value,
        recommendation: row.getCell(4).value,
        reviewText: row.getCell(5).value,
        reviewDate: row.getCell(6).value,
        reviewTime: row.getCell(7).value
    };
}

module.exports = mapMetaReview;
