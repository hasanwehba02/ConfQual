const { readWorkbook } = require("../workbookReader");
const editionRepository = require("../../repositories/editionRepository");

async function importConference(meta = {}) {
    const workbook = await readWorkbook();
    const sheet = workbook.getWorksheet("Submissions");

    let conferenceName = meta.name || "EasyChair Import";
    let shortName = meta.shortName || null;
    let year = meta.year || null;

    // Only auto-detect if user didn't provide a name
    if (!meta.name) {
        // Try to extract conference name from the workbook title property
        if (workbook.title && typeof workbook.title === 'string' && workbook.title.trim() && workbook.title.trim() !== '#') {
            conferenceName = workbook.title.trim();
        } else if (workbook.subject && typeof workbook.subject === 'string' && workbook.subject.trim()) {
            conferenceName = workbook.subject.trim();
        } else if (workbook.description && typeof workbook.description === 'string' && workbook.description.trim()) {
            conferenceName = workbook.description.trim();
        } else if (sheet) {
            let found = false;
            for (let rowNum = 1; rowNum <= 5; rowNum++) {
                const cell = sheet.getCell(`A${rowNum}`).value;
                if (cell && typeof cell === 'string' && cell.trim() && cell.trim() !== '#') {
                    conferenceName = cell.trim();
                    found = true;
                    break;
                }
            }
            if (!found && sheet.name && sheet.name !== 'Submissions') {
                conferenceName = sheet.name;
            }
        }

        const yearMatch = conferenceName.match(/\b(20\d{2})\b/);
        if (yearMatch) year = parseInt(yearMatch[1]);
        shortName = conferenceName.replace(/\s*\d{4}\s*.*/, "").trim() || conferenceName;
    }

    // Create or find conference series
    const series = await editionRepository.findOrCreateConferenceSeries({
        name: conferenceName,
        acronym: shortName
    });

    // Create or find edition
    const edition = await editionRepository.findOrCreateEdition({
        conferenceId: series.id,
        year: year
    });

    console.log(`Conference: ${series.name} (${series.acronym}) - Edition: ${edition.year} (id=${edition.id})`);

    // Seed alert rules for this edition
    try {
        const { ensureAlertRulesForEdition } = require("../../repositories/analytics/helpers");
        await ensureAlertRulesForEdition(edition.id);
    } catch (e) {
        console.warn('Could not seed alert rules:', e.message);
    }

    // Return edition object with series info for use by other importers
    return {
        ...edition,
        conferenceName: series.name,
        shortName: series.acronym,
        conferenceId: series.id
    };
}

module.exports = { importConference };
