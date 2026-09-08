const fs = require('fs');
const path = require('path');
const client = require('../config/database');

async function resetDatabase() {
    console.log("Resetting database schema...");
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'confqual_schema.sql');

    try {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // Drop existing tables first (new structure)
        const dropSql = `
            DROP TABLE IF EXISTS decision_note CASCADE;
            DROP TABLE IF EXISTS comment_note CASCADE;
            DROP TABLE IF EXISTS review_note CASCADE;
            DROP TABLE IF EXISTS assignment_note CASCADE;
            DROP TABLE IF EXISTS researcher_note CASCADE;
            DROP TABLE IF EXISTS author_note CASCADE;
            DROP TABLE IF EXISTS topic_note CASCADE;
            DROP TABLE IF EXISTS edition_note CASCADE;
            DROP TABLE IF EXISTS participant_note CASCADE;
            DROP TABLE IF EXISTS paper_note CASCADE;
            DROP TABLE IF EXISTS conference_note CASCADE;
            DROP TABLE IF EXISTS note CASCADE;
            DROP TABLE IF EXISTS configuration_information CASCADE;
            DROP TABLE IF EXISTS person_conflict CASCADE;
            DROP TABLE IF EXISTS sc_chair CASCADE;
            DROP TABLE IF EXISTS evaluator CASCADE;
            DROP TABLE IF EXISTS author_participant CASCADE;
            DROP TABLE IF EXISTS alert_rule CASCADE;
            DROP TABLE IF EXISTS meta_review CASCADE;
            DROP TABLE IF EXISTS comment CASCADE;
            DROP TABLE IF EXISTS review CASCADE;
            DROP TABLE IF EXISTS conflict CASCADE;
            DROP TABLE IF EXISTS bid CASCADE;
            DROP TABLE IF EXISTS assignment CASCADE;
            DROP TABLE IF EXISTS paper_author_new CASCADE;
            DROP TABLE IF EXISTS paper_topic CASCADE;
            DROP TABLE IF EXISTS topic CASCADE;
            DROP TABLE IF EXISTS paper CASCADE;
            DROP TABLE IF EXISTS participant CASCADE;
            DROP TABLE IF EXISTS anonymised_researcher CASCADE;
            DROP TABLE IF EXISTS researcher CASCADE;
            DROP TABLE IF EXISTS edition CASCADE;
            DROP TABLE IF EXISTS conference_series CASCADE;
            -- Legacy tables (may exist from old schema)
            DROP TABLE IF EXISTS settings CASCADE;
            DROP TABLE IF EXISTS program_committee_member_topic CASCADE;
            DROP TABLE IF EXISTS paper_author CASCADE;
            DROP TABLE IF EXISTS author CASCADE;
            DROP TABLE IF EXISTS program_committee_member CASCADE;
            DROP TABLE IF EXISTS conference CASCADE;
            DROP TABLE IF EXISTS participant_new CASCADE;
        `;

        await client.query(dropSql);
        await client.query(schemaSql);
        console.log("Database schema reset successfully!");
    } catch (err) {
        console.error("Failed to reset database schema:", err);
        throw err;
    }
}

module.exports = resetDatabase;
