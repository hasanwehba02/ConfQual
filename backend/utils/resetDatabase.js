const fs = require('fs');
const path = require('path');
const client = require('../config/database');

async function resetDatabase() {
    console.log("Resetting database schema...");
    const schemaPath = path.join(__dirname, '..', '..', 'database', 'confqual_schema.sql');
    
    try {
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        
        // Drop existing tables first
        const dropSql = `
            DROP TABLE IF EXISTS meta_review CASCADE;
            DROP TABLE IF EXISTS comment CASCADE;
            DROP TABLE IF EXISTS review CASCADE;
            DROP TABLE IF EXISTS conflict CASCADE;
            DROP TABLE IF EXISTS bid CASCADE;
            DROP TABLE IF EXISTS assignment CASCADE;
            DROP TABLE IF EXISTS paper_topic CASCADE;
            DROP TABLE IF EXISTS program_committee_member_topic CASCADE;
            DROP TABLE IF EXISTS topic CASCADE;
            DROP TABLE IF EXISTS paper_author CASCADE;
            DROP TABLE IF EXISTS author CASCADE;
            DROP TABLE IF EXISTS paper CASCADE;
            DROP TABLE IF EXISTS program_committee_member CASCADE;
            DROP TABLE IF EXISTS conference CASCADE;
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
