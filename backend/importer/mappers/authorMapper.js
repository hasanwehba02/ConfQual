function mapAuthor(row) {
    return {
        externalPersonId: row.getCell(7).value,
        firstName: row.getCell(2).value,
        lastName: row.getCell(3).value,
        email: row.getCell(4).value,
        country: row.getCell(5).value,
        affiliation: row.getCell(6).value
    };
}

module.exports = mapAuthor;