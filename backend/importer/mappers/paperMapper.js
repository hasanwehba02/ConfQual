const { extractValue } = require('../../utils/excelHelper');

function mapPaper(row, conferenceId, deletedColIdx = -1) {
    let isDeleted = false;
    if (deletedColIdx !== -1) {
        const delVal = extractValue(row.getCell(deletedColIdx));
        if (delVal) {
            const str = delVal.toString().trim().toLowerCase();
            isDeleted = str === 'yes' || str === 'true' || str === '1';
        }
    }

    const titleStr = extractValue(row.getCell(2));
    const notifiedVal = extractValue(row.getCell(9));
    const reviewsSentVal = extractValue(row.getCell(10));

    return {
        conferenceId: conferenceId,
        externalSubmissionId: extractValue(row.getCell(1)),
        title: titleStr,
        submittedAt: extractValue(row.getCell(4)),
        lastUpdatedAt: extractValue(row.getCell(5)),
        decision: extractValue(row.getCell(8)),
        notified: notifiedVal === "✔" || notifiedVal === "yes",
        reviewsSent: reviewsSentVal === "✔" || reviewsSentVal === "yes",
        isDeleted: isDeleted
    };
}

module.exports = mapPaper;