const { extractValue } = require('../../utils/excelHelper');

const sheetColumnsCache = new WeakMap();

// Locate sub-reviewer columns by header name. EasyChair exports differ:
// some include "Subreviewer ..." columns, others reuse column 13 for
// "Reviewer Person #" — reading it blindly imported reviewers as their own
// sub-reviewers.
function getSubReviewerColumns(worksheet) {
    if (sheetColumnsCache.has(worksheet)) return sheetColumnsCache.get(worksheet);
    const values = worksheet.getRow(1).values || [];
    const byName = {};
    values.forEach((v, i) => {
        if (typeof v === 'string') byName[v.trim().toLowerCase()] = i;
    });
    const cols = {
        firstName: byName['subreviewer first name'] || null,
        lastName: byName['subreviewer last name'] || null,
        email: byName['subreviewer email'] || null,
        personId: byName['subreviewer person #'] || byName['subreviewer #'] || null
    };
    sheetColumnsCache.set(worksheet, cols);
    return cols;
}

function parseIntOrNull(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseInt(val, 10);
    return isNaN(num) ? null : num;
}

function parseFloatOrNull(val) {
    if (val === null || val === undefined || val === '') return null;
    const num = parseFloat(val);
    return isNaN(num) ? null : num;
}

function mapReview(row) {
    let offset = 0;
    // Detect shift: If cell 5 is a string (e.g. 'reviewer30') and cell 4 is a number
    if (typeof row.getCell(4).value === 'number' && typeof row.getCell(5).value === 'string') {
        offset = 1;
    }

    const sub = row.worksheet ? getSubReviewerColumns(row.worksheet)
        : { firstName: null, lastName: null, email: null, personId: null };

    const hasAttachmentCell = extractValue(row.getCell(16 + offset));
    const hasAttachment = hasAttachmentCell === 'yes' || hasAttachmentCell === '✔';

    return {
        externalSubmissionId: parseIntOrNull(extractValue(row.getCell(2))),
        externalPersonId: parseIntOrNull(extractValue(row.getCell(3))), // Primary PC Member
        memberName: extractValue(row.getCell(4 + offset)),
        subReviewerPersonId: sub.personId ? parseIntOrNull(extractValue(row.getCell(sub.personId))) : null,
        subReviewerFirstName: sub.firstName ? (extractValue(row.getCell(sub.firstName)) || null) : null,
        subReviewerLastName: sub.lastName ? (extractValue(row.getCell(sub.lastName)) || null) : null,
        subReviewerEmail: sub.email ? (extractValue(row.getCell(sub.email)) || null) : null,
        reviewNumber: parseIntOrNull(extractValue(row.getCell(5 + offset))) || 1,
        version: parseIntOrNull(extractValue(row.getCell(6 + offset))) || 1,
        reviewText: extractValue(row.getCell(7 + offset)) || '',
        scores: extractValue(row.getCell(8 + offset)) || null,
        totalScore: parseFloatOrNull(extractValue(row.getCell(9 + offset))),
        reviewDate: extractValue(row.getCell(14 + offset)) || null,
        reviewTime: extractValue(row.getCell(15 + offset)) || null,
        hasAttachment: hasAttachment
    };
}

module.exports = mapReview;
