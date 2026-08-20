const { extractValue } = require('../../utils/excelHelper');

function mapConflict(row, headerMap) {
    if (headerMap) {
        const getVal = (name) => {
            const idx = headerMap[name.toLowerCase()];
            return idx ? extractValue(row.getCell(idx)) : null;
        };
        return {
            externalPersonId: getVal('member #') ?? getVal('person #') ?? extractValue(row.getCell(1)),
            externalSubmissionId: getVal('submission #') ?? getVal('paper #') ?? extractValue(row.getCell(2))
        };
    }
    return {
        externalPersonId: extractValue(row.getCell(1)),
        externalSubmissionId: extractValue(row.getCell(2))
    };
}

module.exports = mapConflict;
