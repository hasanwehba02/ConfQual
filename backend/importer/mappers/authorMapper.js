const { extractValue } = require('../../utils/excelHelper');

function mapAuthor(row, headerMap) {
    if (headerMap) {
        const getVal = (name) => {
            const idx = headerMap[name.toLowerCase()];
            return idx ? extractValue(row.getCell(idx)) : null;
        };
        return {
            externalPersonId: getVal('person #') ?? getVal('member #') ?? extractValue(row.getCell(7)),
            firstName: getVal('first name') ?? extractValue(row.getCell(2)),
            lastName: getVal('last name') ?? extractValue(row.getCell(3)),
            email: getVal('email') ?? extractValue(row.getCell(4)),
            country: getVal('country') ?? extractValue(row.getCell(5)),
            affiliation: getVal('affiliation') ?? extractValue(row.getCell(6)),
            webPage: getVal('web page') ?? null
        };
    }
    return {
        externalPersonId: extractValue(row.getCell(7)),
        firstName: extractValue(row.getCell(2)),
        lastName: extractValue(row.getCell(3)),
        email: extractValue(row.getCell(4)),
        country: extractValue(row.getCell(5)),
        affiliation: extractValue(row.getCell(6))
    };
}

module.exports = mapAuthor;
