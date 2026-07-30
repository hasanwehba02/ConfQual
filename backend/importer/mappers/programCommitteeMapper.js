const { extractValue } = require('../../utils/excelHelper');

function mapProgramCommitteeMember(row, conferenceId, roleIndex = 8) {
    return {
        conferenceId,
        externalPersonId: extractValue(row.getCell(2)),
        firstName: extractValue(row.getCell(3)),
        lastName: extractValue(row.getCell(4)),
        email: extractValue(row.getCell(5)),
        country: extractValue(row.getCell(6)),
        affiliation: extractValue(row.getCell(7)),
        role: extractValue(row.getCell(roleIndex)) || 'Unknown'
    };
}

module.exports = mapProgramCommitteeMember;