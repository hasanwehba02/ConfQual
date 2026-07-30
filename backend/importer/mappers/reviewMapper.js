const { extractValue } = require('../../utils/excelHelper');

function mapReview(row) {
    let offset = 0;
    // Detect shift: If cell 5 is a string (e.g. 'reviewer30') and cell 4 is a number
    if (typeof row.getCell(4).value === 'number' && typeof row.getCell(5).value === 'string') {
        offset = 1;
    }

    const hasAttachmentCell = extractValue(row.getCell(16 + offset));
    const hasAttachment = hasAttachmentCell === 'yes' || hasAttachmentCell === '✔';
    
    return {
        externalSubmissionId: extractValue(row.getCell(2)),
        externalPersonId: extractValue(row.getCell(3)), // Primary PC Member
        memberName: extractValue(row.getCell(4 + offset)),
        subReviewerPersonId: extractValue(row.getCell(13 + offset)),
        subReviewerFirstName: extractValue(row.getCell(10 + offset)),
        subReviewerLastName: extractValue(row.getCell(11 + offset)),
        subReviewerEmail: extractValue(row.getCell(12 + offset)),
        reviewNumber: extractValue(row.getCell(5 + offset)),
        version: extractValue(row.getCell(6 + offset)),
        reviewText: extractValue(row.getCell(7 + offset)),
        scores: extractValue(row.getCell(8 + offset)),
        totalScore: extractValue(row.getCell(9 + offset)),
        reviewDate: extractValue(row.getCell(14 + offset)),
        reviewTime: extractValue(row.getCell(15 + offset)),
        hasAttachment: hasAttachment
    };
}

module.exports = mapReview;
