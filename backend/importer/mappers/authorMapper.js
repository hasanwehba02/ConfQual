const { extractValue } = require('../../utils/excelHelper');

function mapAuthor(row) {
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