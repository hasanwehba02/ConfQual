CREATE TABLE IF NOT EXISTS alert_rule (
    id SERIAL PRIMARY KEY,
    conference_id INT NOT NULL REFERENCES conference(id) ON DELETE CASCADE,
    rule_key TEXT NOT NULL,
    threshold_value NUMERIC NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT true,
    UNIQUE(conference_id, rule_key)
);
