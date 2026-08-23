require('dotenv').config();

const fs = require('fs');
const path = require('path');
const app = require('./app');
const client = require('./config/database');

const PORT = process.env.PORT || 3000;

// --- Startup Migration ---
async function runMigrations() {
    const migrationPath = path.join(__dirname, '..', 'database', 'migrations', '001_multi_conference.sql');
    try {
        if (fs.existsSync(migrationPath)) {
            const sql = fs.readFileSync(migrationPath, 'utf8');
            await client.query(sql);
            console.log('✅ Migrations applied successfully.');
        }
    } catch (err) {
        if (!err.message.includes('already exists')) {
            console.warn('⚠️  Migration warning:', err.message);
        }
    }
}

if (require.main === module) {
    app.listen(PORT, async () => {
        console.log(`Backend listening at http://localhost:${PORT}`);
        await runMigrations();
    });
}

module.exports = { app, runMigrations };
