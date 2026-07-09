const { extractValue } = require('../../utils/excelHelper');

function mapMetaReview(row, headerMap) {
    const getValue = (header) => {
        const index = headerMap[header.toLowerCase()];
        return index ? extractValue(row.getCell(index)) : null;
    };

    return {
        externalSubmissionId: getValue('submission #'),
        externalPersonId: getValue('member #'),
        recommendation: getValue('recommendation'),
        reviewText: getValue('text'),
        reviewDate: getValue('date'),
        reviewTime: getValue('time')
    };
}

module.exports = mapMetaReview;
