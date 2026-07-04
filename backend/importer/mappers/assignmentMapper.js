function mapAssignment(row) {
    return {
        externalPersonId: row.getCell(1).value,
        externalSubmissionId: row.getCell(2).value
    };
}

module.exports = mapAssignment;
