const { readWorkbook } = require("../workbookReader");
const mapProgramCommitteeMember = require("../mappers/programCommitteeMapper");
const participantRepository = require("../../repositories/participantRepository");
const researcherRepository = require("../../repositories/researcherRepository");
const client = require("../../config/database");

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

    // --- Step 1: Parse all rows first ---
    const seenIds = new Set();
    const members = [];
    let skipped = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const member = mapProgramCommitteeMember(row, edition.id, roleIndex);

        if (!member.externalPersonId) { skipped++; continue; }
        if (seenIds.has(member.externalPersonId)) continue;
        seenIds.add(member.externalPersonId);
        members.push(member);
    }

    if (members.length === 0) {
        console.log(`Imported program committee members: 0`);
        console.log(`Skipped rows: ${skipped}`);
        console.log("Program committee imported successfully.\n");
        return;
    }

    // --- Step 2: Bulk find-or-create researchers (2 queries for email rows, 1 per no-email row) ---
    const researcherItems = members.map(m => ({
        firstName:   m.firstName,
        lastName:    m.lastName,
        email:       m.email,
        country:     m.country,
        affiliation: m.affiliation,
        webPage:     null
    }));
    const researcherMap = await researcherRepository.bulkFindOrCreateResearchers(researcherItems);
    // researcherMap: index → researcher row

    // --- Step 3: Bulk find-or-create participants (2 queries) ---
    const participantItems = [];
    for (let i = 0; i < members.length; i++) {
        const researcher = researcherMap.get(i);
        if (!researcher) continue;
        participantItems.push({
            index:            i,
            researcherId:     researcher.id,
            editionId:        edition.id,
            externalPersonId: members[i].externalPersonId
        });
    }
    const participantByExtId = await participantRepository.bulkFindOrCreateParticipants(participantItems);
    // participantByExtId: externalPersonId → participant row

    // --- Step 4: Bulk upsert evaluator roles (1 query) ---
    const evalItems = members.filter(m => m.role && participantByExtId.has(m.externalPersonId));
    if (evalItems.length > 0) {
        const participantIds = evalItems.map(m => participantByExtId.get(m.externalPersonId).id);
        const roles          = evalItems.map(m => mapRole(m.role));
        const seniors        = evalItems.map(m => m.role.toLowerCase().includes('senior'));

        await client.query(`
            INSERT INTO evaluator (participant_id, evaluator_role, is_senior)
            SELECT * FROM unnest($1::int[], $2::text[], $3::bool[])
            ON CONFLICT (participant_id) DO UPDATE
                SET evaluator_role = EXCLUDED.evaluator_role,
                    is_senior      = EXCLUDED.is_senior
        `, [participantIds, roles, seniors]);
    }

    const imported = participantByExtId.size;
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

