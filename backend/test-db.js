require("dotenv").config();
const { Pool } = require("pg");

async function runDiagnostics() {
    console.log("DIAGNOSTICS: Checking Database Setup\n");

    // 1. Check if environment variables are loaded
    const connStr = process.env.DATABASE_URL;
    if (!connStr) {
        console.error("ERROR: DATABASE_URL is missing.");
        console.error("   Make sure your .env file is located inside the 'backend' folder");
        console.error("   and contains a line like: DATABASE_URL=postgres://...");
        process.exit(1);
    } else {
        console.log("DATABASE_URL is present in environment variables.\n");
    }

    // 2. Try Connecting
    let options = { connectionString: connStr };
    if (!connStr.includes('uselibpqcompat')) {
        options.connectionString += (connStr.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
    }
    options.ssl = { rejectUnauthorized: false };

    console.log("\n⏳ Attempting to connect to the database...");
    const pool = new Pool(options);

    let client;
    try {
        client = await pool.connect();
        console.log("Successfully connected to PostgreSQL!");
    } catch (err) {
        console.error("ERROR: Could not connect to the database.");
        console.error("   Details:", err.message);
        console.error("   Check if your connection string is correct and the database is accessible.");
        process.exit(1);
    }

    // 3. Check Schema
    console.log("\n⏳ Checking if the database schema is initialized...");
    try {
        const res = await client.query("SELECT to_regclass('public.conference') as table_exists;");
        if (res.rows[0].table_exists) {
            console.log("Schema appears to be initialized (conference table exists).");
        } else {
            console.error("ERROR: The 'conference' table is missing!");
            console.error("   The database is empty. You need to run the schema script.");
            console.error("   Please execute the SQL commands in 'database/confqual_schema.sql' in your Neon database.");
        }
    } catch (err) {
        console.error("ERROR: Failed to query the database tables.");
        console.error(err.message);
    } finally {
        client.release();
        pool.end();
    }

    console.log("\n=========================================");
    console.log("Done.");
}

runDiagnostics();
