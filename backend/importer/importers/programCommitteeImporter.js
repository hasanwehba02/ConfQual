const { readWorkbook } = require("../workbookReader");
const mapProgramCommitteeMember = require("../mappers/programCommitteeMapper");
const programCommitteeService = require("../../repositories/programCommitteeRepository");

async function importProgramCommittee(conference) {
    const workbook = await readWorkbook();

    const sheet = workbook.getWorksheet("Program committee");

    let roleIndex = 8; // Default
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        if (cell.value && typeof cell.value === 'string' && cell.value.toLowerCase() === 'role') {
            roleIndex = colNumber;
        }
    });

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const member = mapProgramCommitteeMember(row, conference.id, roleIndex);

        if (!member.externalPersonId) {
            skipped++;
            continue;
        }
        dtos.push(member);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = [];
        for (const member of chunk) {
            results.push(await programCommitteeService.createProgramCommitteeMember(member));
        }
        for (const savedMember of results) {
            if (savedMember) imported++;
            else skipped++;
        }
    }

    console.log(`Imported program committee members: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Program committee imported successfully.\n");
}

module.exports = importProgramCommittee;