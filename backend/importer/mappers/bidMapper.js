function mapBid(row) {
    return {
        externalPersonId: row.getCell(1).value,
        externalSubmissionId: row.getCell(2).value,
        bid: row.getCell(3).value
    };
}

module.exports = mapBid;
