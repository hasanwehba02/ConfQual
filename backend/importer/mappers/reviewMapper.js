function mapReview(row) {
    return {
        externalSubmissionId: row.getCell(2).value,
        externalPersonId: row.getCell(13).value || row.getCell(3).value, // fallback to member # if person # is missing
        reviewNumber: row.getCell(5).value,
        version: row.getCell(6).value,
        reviewText: row.getCell(7).value,
        scores: row.getCell(8).value,
        totalScore: row.getCell(9).value,
        reviewDate: row.getCell(14).value,
        reviewTime: row.getCell(15).value,
        hasAttachment: row.getCell(16).value === 'yes' || row.getCell(16).value === '✔'
    };
}

module.exports = mapReview;
