function mapPaper(row, conferenceId) {
    return {
        conferenceId: conferenceId,
        externalSubmissionId: row.getCell(1).value,
        title: row.getCell(2).value,
        submittedAt: row.getCell(4).value,
        lastUpdatedAt: row.getCell(5).value,
        decision: row.getCell(8).value,
        notified: row.getCell(9).value === "✔",
        reviewsSent: row.getCell(10).value === "✔"
    };
}

module.exports = mapPaper;