const pool = require('../config/database');

async function getSettings(req, res) {
    try {
        const result = await pool.query('SELECT is_anonymized, decision_editing_enabled FROM settings LIMIT 1');
        if (result.rows.length === 0) {
            return res.json({ is_anonymized: false, decision_editing_enabled: false });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function updateSettings(req, res) {
    const { is_anonymized, decision_editing_enabled } = req.body;
    
    try {
        const query = `
            INSERT INTO settings (id, is_anonymized, decision_editing_enabled)
            VALUES (1, $1, $2)
            ON CONFLICT (id) 
            DO UPDATE SET 
                is_anonymized = EXCLUDED.is_anonymized, 
                decision_editing_enabled = EXCLUDED.decision_editing_enabled
            RETURNING id;
        `;
        await pool.query(query, [is_anonymized, decision_editing_enabled || false]);
        res.json({ success: true });
    } catch (error) {
        console.error("Error updating settings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

module.exports = {
    getSettings,
    updateSettings
};
