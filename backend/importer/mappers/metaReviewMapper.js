const { extractValue } = require('../../utils/excelHelper');

function mapMetaReview(row, headerMap) {
    if (headerMap) {
        const getValue = (header) => {
            const index = headerMap[header.toLowerCase()];
            return index ? extractValue(row.getCell(index)) : null;
        };

        return {
            externalSubmissionId: getValue('submission #') ?? extractValue(row.getCell(1)),
            externalPersonId: getValue('member #') ?? getValue('person #') ?? extractValue(row.getCell(2)),
            recommendation: getValue('recommendation') ?? extractValue(row.getCell(4)),
            reviewText: getValue('text') ?? extractValue(row.getCell(5)),
            reviewDate: getValue('date') ?? extractValue(row.getCell(7)),
            reviewTime: getValue('time') ?? extractValue(row.getCell(8))
        };
    }
    return {
        externalSubmissionId: extractValue(row.getCell(1)),
        externalPersonId: extractValue(row.getCell(2)),
        recommendation: extractValue(row.getCell(4)),
        reviewText: extractValue(row.getCell(5)),
        reviewDate: extractValue(row.getCell(7)),
        reviewTime: extractValue(row.getCell(8))
    };
}

module.exports = mapMetaReview;
