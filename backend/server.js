require("dotenv").config();

const express = require("express");
const client = require("./config/database");
const fs = require("fs");
const path = require("path");

const analyticsRoutes = require("./routes/analyticsRoutes");
const settingsRoutes = require("./routes/settingsRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Routes
app.use("/api/analytics", analyticsRoutes);
app.use("/api/settings", settingsRoutes);

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
        // Non-fatal — the migration uses IF NOT EXISTS so repeated runs are safe
        console.warn('⚠️  Migration warning (may already be applied):', err.message);
    }
}

app.listen(PORT, async () => {
    console.log(`Backend listening at http://localhost:${PORT}`);
    await runMigrations();
});