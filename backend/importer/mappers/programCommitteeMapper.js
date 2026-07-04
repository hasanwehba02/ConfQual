function mapProgramCommitteeMember(row, conferenceId) {
    return {
        conferenceId: conferenceId,
        externalPersonId: row.getCell(2).value,
        firstName: row.getCell(3).value,
        lastName: row.getCell(4).value,
        email: row.getCell(5).value,
        country: row.getCell(6).value,
        affiliation: row.getCell(7).value,
        role: row.getCell(8).value
    };
}

module.exports = mapProgramCommitteeMember;