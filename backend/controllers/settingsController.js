const pool = require('../config/database');

async function getSettings(req, res) {
    try {
        const result = await pool.query('SELECT is_anonymized, anonymization_prefix, decision_editing_enabled FROM settings LIMIT 1');
        if (result.rows.length === 0) {
            return res.json({ is_anonymized: false, anonymization_prefix: 'CAiSE_26_Tech', decision_editing_enabled: false });
        }
        res.json(result.rows[0]);
    } catch (error) {
        console.error("Error fetching settings:", error);
        res.status(500).json({ error: "Internal server error" });
    }
}

async function updateSettings(req, res) {
    const { is_anonymized, anonymization_prefix, decision_editing_enabled } = req.body;
    try {
        const result = await pool.query('UPDATE settings SET is_anonymized = $1, anonymization_prefix = $2, decision_editing_enabled = $3 RETURNING id', [is_anonymized, anonymization_prefix, decision_editing_enabled || false]);
        if (result.rowCount === 0) {
            await pool.query('INSERT INTO settings (is_anonymized, anonymization_prefix, decision_editing_enabled) VALUES ($1, $2, $3)', [is_anonymized, anonymization_prefix, decision_editing_enabled || false]);
        }
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
