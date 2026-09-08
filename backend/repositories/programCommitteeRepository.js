const client = require("../config/database");
const participantRepository = require("./participantRepository");
const researcherRepository = require("./researcherRepository");

async function createProgramCommitteeMember(member) {
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
            editionId: member.editionId || member.conferenceId, // backward compatible
            externalPersonId: member.externalPersonId
        });

        // Create evaluator role if provided
        if (member.role) {
            await participantRepository.createEvaluator(participant.id, {
                evaluatorRole: mapRole(member.role),
                isSenior: member.role.toLowerCase().includes('senior')
            });
        }

        return participant;
    } catch (err) {
        console.error('Error creating program committee member:', err);
        return null;
    }
}

function mapRole(role) {
    const lower = role.toLowerCase();
    if (lower.includes('sub-reviewer') || lower.includes('subreviewer')) return 'subreviewer';
    if (lower.includes('chair')) return 'pc_chair';
    return 'pc_member';
}

async function findByExternalPersonId(externalPersonId, editionId) {
    const query = `
        SELECT pt.*, r.first_name, r.last_name, r.email, r.country, r.affiliation,
               ev.evaluator_role, ev.is_senior
        FROM participant pt
        JOIN researcher r ON r.id = pt.researcher_id
        LEFT JOIN evaluator ev ON ev.participant_id = pt.id
        WHERE pt.external_person_id = $1
        ${editionId ? 'AND pt.edition_id = $2' : ''}
    `;
    const params = [externalPersonId];
    if (editionId) params.push(editionId);
    const result = await client.query(query, params);
    return result.rows[0] || null;
}

async function getIdMap(editionId) {
    const query = `SELECT external_person_id, id FROM participant WHERE edition_id = $1`;
    const result = await client.query(query, [editionId]);
    const map = {};
    for (const row of result.rows) {
        map[row.external_person_id] = row.id;
    }
    return map;
}

module.exports = {
    createProgramCommitteeMember,
    findByExternalPersonId,
    getIdMap
};
