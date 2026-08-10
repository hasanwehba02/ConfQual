const client = require("../config/database");
async function bulkInsert(table, columns, rows, conflictTarget) {
    if (!rows || rows.length === 0) return 0;
    const placeholders = [];
    const flatValues = [];
    let paramIndex = 1;
    for (const row of rows) {
        const rowPlaceholders = [];
        for (const val of row) {
            rowPlaceholders.push(`$${paramIndex++}`);
            flatValues.push(val);
        }
        placeholders.push(`(${rowPlaceholders.join(", ")})`);
    }
    let query = `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${placeholders.join(", ")}`;
    if (conflictTarget) query += ` ON CONFLICT ${conflictTarget} DO NOTHING`;
    const result = await client.query(query, flatValues);
    return result.rowCount || 0;
}
module.exports = bulkInsert;