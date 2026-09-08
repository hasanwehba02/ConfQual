#!/usr/bin/env node

/**
 * Migration 008 Test Script
 * Tests migration 008 on a backup database before applying to production
 */

require('dotenv').config();
const { Pool } = require('pg');

// IMPORTANT: Set this to your TEST database URL
const TEST_DB_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;

if (!TEST_DB_URL) {
    console.error('❌ No database URL found. Set TEST_DATABASE_URL or DATABASE_URL in .env');
    process.exit(1);
}

console.log('🔍 Migration 008 Pre-flight Test');
console.log('================================\n');

const pool = new Pool({
    connectionString: TEST_DB_URL,
    ssl: TEST_DB_URL.includes('supabase') || TEST_DB_URL.includes('amazonaws')
        ? { rejectUnauthorized: false }
        : undefined
});

async function checkTable(tableName, shouldExist = true) {
    const result = await pool.query(
        `SELECT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = $1)`,
        [tableName]
    );
    const exists = result.rows[0].exists;
    const status = exists === shouldExist ? '✅' : '❌';
    const verb = shouldExist ? 'exists' : 'does not exist';
    console.log(`${status} ${tableName} ${verb}`);
    return exists === shouldExist;
}

async function runTests() {
    try {
        console.log('📋 Pre-Migration Checks');
        console.log('-----------------------\n');

        // Check that migrations 001-007 have been applied
        console.log('Checking for new table structure (migrations 001-007):');
        await checkTable('conference_series', true);
        await checkTable('edition', true);
        await checkTable('researcher', true);
        await checkTable('participant_new', true); // Should exist before migration 008
        await checkTable('evaluator', true);
        await checkTable('author_participant', true);

        console.log('\nChecking for old tables (should still exist):');
        const oldConferenceExists = await checkTable('conference', true);
        const oldPCMExists = await checkTable('program_committee_member', true);
        const oldAuthorExists = await checkTable('author', true);

        if (!oldConferenceExists || !oldPCMExists || !oldAuthorExists) {
            console.log('\n⚠️  Warning: Old tables already dropped. Migration 008 may have been applied already.');
        }

        console.log('\n📊 Data Count Check');
        console.log('-------------------\n');

        // Count records in key tables
        const tables = [
            'conference_series',
            'edition',
            'researcher',
            'participant_new',
            'paper'
        ];

        for (const table of tables) {
            try {
                const result = await pool.query(`SELECT COUNT(*) FROM ${table}`);
                console.log(`${table}: ${result.rows[0].count} rows`);
            } catch (err) {
                console.log(`${table}: ⚠️  Error reading (${err.message})`);
            }
        }

        console.log('\n✅ Pre-migration checks complete');
        console.log('\nNext steps:');
        console.log('1. Create a database backup:');
        console.log('   pg_dump $DATABASE_URL > backup_before_migration_008.sql');
        console.log('\n2. Apply migration 008:');
        console.log('   psql $DATABASE_URL -f database/migrations/008_finalize_data_model.sql');
        console.log('\n3. Verify migration:');
        console.log('   node backend/scripts/test-migration-008-post.js');

    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

runTests();
