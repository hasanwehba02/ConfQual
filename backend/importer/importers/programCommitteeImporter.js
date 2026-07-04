const readWorkbook = require("../workbookReader");
const mapProgramCommitteeMember = require("../mappers/programCommitteeMapper");
const programCommitteeService = require("../../services/programCommitteeService");

async function importProgramCommittee(conference) {
    const workbook = await readWorkbook();

    const sheet = workbook.getWorksheet("Program committee");

    let imported = 0;
    let skipped = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);

        const member = mapProgramCommitteeMember(row, conference.id);

        if (!member.externalPersonId) {
            skipped++;
            continue;
        }

        const savedMember = await programCommitteeService.createProgramCommitteeMember(member);

        if (savedMember) {
            imported++;
        } else {
            skipped++;
        }
    }

    console.log(`Imported program committee members: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Program committee imported successfully.\n");
}

module.exports = importProgramCommittee;