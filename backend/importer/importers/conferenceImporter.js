const { readWorkbook } = require("../workbookReader");
const client = require("../../config/database");

async function importConference() {
    const workbook = await readWorkbook();
    const sheet = workbook.getWorksheet("Submissions");

    let conferenceName = "EasyChair Import";
    let shortName = null;
    let year = null;

    // Try to extract conference name from the workbook
    if (sheet) {
        const cell = sheet.getCell("A1").value;
        if (cell && typeof cell === "string" && cell.trim()) {
            conferenceName = cell.trim();
        }
    }

    // Attempt to parse year from name (e.g. "CAiSE 2025" → 2025)
    const yearMatch = conferenceName.match(/\b(20\d{2})\b/);
    if (yearMatch) year = parseInt(yearMatch[1]);

    // Derive short_name as the part before the year
    shortName = conferenceName.replace(/\s*\d{4}\s*.*/, "").trim() || conferenceName;

    // Overwrite logic: if a conference with the same short_name + year exists, delete it first
    if (shortName && year) {
        const existing = await client.query(
            `SELECT id FROM conference WHERE short_name = $1 AND year = $2`,
            [shortName, year]
        );
        if (existing.rows.length > 0) {
            await client.query(`DELETE FROM conference WHERE id = $1`, [existing.rows[0].id]);
            console.log(`Replaced existing conference: ${shortName} ${year}`);
        }
    }

    const result = await client.query(
        `INSERT INTO conference (name, short_name, year) VALUES ($1, $2, $3) RETURNING *;`,
        [conferenceName, shortName || conferenceName, year]
    );

    console.log(`Conference created: ${conferenceName}`);
    return result.rows[0];
}

module.exports = importConference;
