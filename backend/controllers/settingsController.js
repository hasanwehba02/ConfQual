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
    
    if (anonymization_prefix && !/^[A-Za-z0-9_-]{0,50}$/.test(anonymization_prefix)) {
        return res.status(400).json({ error: "Invalid anonymization prefix" });
    }

    try {
        const query = `
            INSERT INTO settings (id, is_anonymized, anonymization_prefix, decision_editing_enabled)
            VALUES (1, $1, $2, $3)
            ON CONFLICT (id) 
            DO UPDATE SET 
                is_anonymized = EXCLUDED.is_anonymized, 
                anonymization_prefix = EXCLUDED.anonymization_prefix, 
                decision_editing_enabled = EXCLUDED.decision_editing_enabled
            RETURNING id;
        `;
        await pool.query(query, [is_anonymized, anonymization_prefix, decision_editing_enabled || false]);
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
