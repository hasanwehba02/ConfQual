const { extractValue } = require('../../utils/excelHelper');

function mapBid(row, headerMap) {
    if (headerMap) {
        const getVal = (name) => {
            const idx = headerMap[name.toLowerCase()];
            return idx ? extractValue(row.getCell(idx)) : null;
        };
        return {
            externalPersonId: getVal('member #') ?? getVal('person #') ?? extractValue(row.getCell(1)),
            externalSubmissionId: getVal('submission #') ?? getVal('paper #') ?? extractValue(row.getCell(2)),
            bid: getVal('bid') ?? extractValue(row.getCell(3))
        };
    }
    return {
        externalPersonId: extractValue(row.getCell(1)),
        externalSubmissionId: extractValue(row.getCell(2)),
        bid: extractValue(row.getCell(3))
    };
}

module.exports = mapBid;
