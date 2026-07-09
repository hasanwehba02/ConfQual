const { extractValue } = require('../../utils/excelHelper');

function mapReview(row) {
    const hasAttachmentCell = extractValue(row.getCell(16));
    const hasAttachment = hasAttachmentCell === 'yes' || hasAttachmentCell === '✔';
    
    return {
        externalSubmissionId: extractValue(row.getCell(2)),
        externalPersonId: extractValue(row.getCell(3)), // Primary PC Member
        subReviewerPersonId: extractValue(row.getCell(13)),
        subReviewerFirstName: extractValue(row.getCell(10)),
        subReviewerLastName: extractValue(row.getCell(11)),
        subReviewerEmail: extractValue(row.getCell(12)),
        reviewNumber: extractValue(row.getCell(5)),
        version: extractValue(row.getCell(6)),
        reviewText: extractValue(row.getCell(7)),
        scores: extractValue(row.getCell(8)),
        totalScore: extractValue(row.getCell(9)),
        reviewDate: extractValue(row.getCell(14)),
        reviewTime: extractValue(row.getCell(15)),
        hasAttachment: hasAttachment
    };
}

module.exports = mapReview;
