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
    // Re-import strategy: find-or-update (never delete) so ConfQual-created data (notes, config) survives
    if (shortName && year) {
        const existing = await client.query(
            `SELECT * FROM conference WHERE short_name = $1 AND year = $2`,
            [shortName, year]
        );
        if (existing.rows.length > 0) {
            const conf = existing.rows[0];
            // Update name if provided and different
            if (conferenceName && conferenceName !== conf.name) {
                await client.query(`UPDATE conference SET name = $1 WHERE id = $2`, [conferenceName, conf.id]);
                conf.name = conferenceName;
            }
            console.log(`Reusing existing conference: ${shortName} ${year} (id=${conf.id})`);
            try {
                const { ensureAlertRulesForConference } = require("../../repositories/analytics/helpers");
                await ensureAlertRulesForConference(conf.id);
            } catch (e) { console.warn('Could not seed alert rules:', e.message); }
            return conf;
        }
    }

    const result = await client.query(
        `INSERT INTO conference (name, short_name, year) VALUES ($1, $2, $3) RETURNING *;`,
        [conferenceName, shortName || conferenceName, year]
    );

    console.log(`Conference created: ${conferenceName}`);
    try {
        const { ensureAlertRulesForConference } = require("../../repositories/analytics/helpers");
        await ensureAlertRulesForConference(result.rows[0].id);
    } catch (e) { console.warn('Could not seed alert rules:', e.message); }
    return result.rows[0];
}

module.exports = importConference;
