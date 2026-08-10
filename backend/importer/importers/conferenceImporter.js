const { readWorkbook } = require("../workbookReader");
const client = require("../../config/database");

async function importConference(meta = {}) {
    const workbook = await readWorkbook();
    const sheet = workbook.getWorksheet("Submissions");

    let conferenceName = meta.name || "EasyChair Import";
    let shortName = meta.shortName || null;
    let year = meta.year || null;

    // Only auto-detect if user didn't provide a name
    if (!meta.name) {
        // Try to extract conference name from the workbook title property
        // (EasyChair sets A1 to "#" which is just the column header — not the conference name)
        if (workbook.title && typeof workbook.title === 'string' && workbook.title.trim() && workbook.title.trim() !== '#') {
            conferenceName = workbook.title.trim();
        } else if (workbook.subject && typeof workbook.subject === 'string' && workbook.subject.trim()) {
            conferenceName = workbook.subject.trim();
        } else if (workbook.description && typeof workbook.description === 'string' && workbook.description.trim()) {
            conferenceName = workbook.description.trim();
        } else if (sheet) {
            // Try to find a non-header, non-'#' text value in the first few rows of column A
            let found = false;
            for (let rowNum = 1; rowNum <= 5; rowNum++) {
                const cell = sheet.getCell(`A${rowNum}`).value;
                if (cell && typeof cell === 'string' && cell.trim() && cell.trim() !== '#') {
                    conferenceName = cell.trim();
                    found = true;
                    break;
                }
            }
            // If still not found, use the sheet name itself
            if (!found && sheet.name && sheet.name !== 'Submissions') {
                conferenceName = sheet.name;
            }
        }

        // Attempt to parse year from name (e.g. "CAiSE 2025" → 2025)
        const yearMatch = conferenceName.match(/\b(20\d{2})\b/);
        if (yearMatch) year = parseInt(yearMatch[1]);

        // Derive short_name as the part before the year
        shortName = conferenceName.replace(/\s*\d{4}\s*.*/, "").trim() || conferenceName;
    }
    // Overwrite logic: if a conference with the same short_name + year exists, delete it first
    if (shortName && year) {
        const existing = await client.query(
            `SELECT id FROM conference WHERE short_name = $1 AND year = $2`,
            [shortName, year]
        );
        if (existing.rows.length > 0) {
            const idToDelete = existing.rows[0].id;
            await client.query(`DELETE FROM paper WHERE conference_id = $1`, [idToDelete]);
            await client.query(`DELETE FROM program_committee_member WHERE conference_id = $1`, [idToDelete]);
            await client.query(`DELETE FROM conference WHERE id = $1`, [idToDelete]);
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
