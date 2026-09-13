const { readWorkbook } = require("../workbookReader");
const mapProgramCommitteeMember = require("../mappers/programCommitteeMapper");
const participantRepository = require("../../repositories/participantRepository");
const researcherRepository = require("../../repositories/researcherRepository");

async function importProgramCommittee(edition) {
    const workbook = await readWorkbook();
    const sheet = workbook.getWorksheet("Program committee");

    if (!sheet) {
        console.log("No 'Program committee' sheet found. Skipping program committee import.");
        return;
    }

    let roleIndex = 8;
    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell, colNumber) => {
        if (cell.value && typeof cell.value === 'string' && cell.value.toLowerCase() === 'role') {
            roleIndex = colNumber;
        }
    });

    let imported = 0;
    let skipped = 0;
    const processedIds = new Set();

    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const member = mapProgramCommitteeMember(row, edition.id, roleIndex);

        if (!member.externalPersonId) {
            skipped++;
            continue;
        }

        if (processedIds.has(member.externalPersonId)) {
            continue;
        }
        processedIds.add(member.externalPersonId);

        try {
            // Find or create researcher
            const researcher = await researcherRepository.findOrCreateResearcher({
                firstName: member.firstName,
                lastName: member.lastName,
                email: member.email,
                country: member.country,
                affiliation: member.affiliation
            });

            // Find or create participant in this edition
            const participant = await participantRepository.findOrCreateParticipant({
                researcherId: researcher.id,
                editionId: edition.id,
                externalPersonId: member.externalPersonId
            });

            // Create evaluator role
            if (member.role) {
                await participantRepository.createEvaluator(participant.id, {
                    evaluatorRole: mapRole(member.role),
                    isSenior: member.role.toLowerCase().includes('senior')
                });
            }

            imported++;
        } catch (err) {
            console.error(`Error importing PC member: ${err.message}`);
            skipped++;
        }
    }

    console.log(`Imported program committee members: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Program committee imported successfully.\n");
}

function mapRole(role) {
    const lower = role.toLowerCase();
    if (lower.includes('sub-reviewer') || lower.includes('subreviewer')) return 'subreviewer';
    if (lower.includes('chair')) return 'pc_chair';
    return 'pc_member';
}

module.exports = importProgramCommittee;
