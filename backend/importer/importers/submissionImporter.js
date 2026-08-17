const { readWorkbook } = require("../workbookReader");
const mapPaper = require("../mappers/paperMapper");
const paperRepository = require("../../repositories/paperRepository");

async function importSubmissions(conference) {
    const workbook = await readWorkbook();

    const submissionsSheet = workbook.getWorksheet("Submissions");

    if (!submissionsSheet) {
        console.log("No 'Submissions' sheet found. Skipping submissions import.");
        return;
    }

    let imported = 0;
    let skipped = 0;

    const headerRow = submissionsSheet.getRow(1);
    let deletedColIdx = -1;
    headerRow.eachCell((cell, colNumber) => {
        if (cell.value && cell.value.toString().trim().toLowerCase() === 'deleted') {
            deletedColIdx = colNumber;
        }
    });

    const dtos = [];
    for (let i = 2; i <= submissionsSheet.rowCount; i++) {
        const row = submissionsSheet.getRow(i);
        const paper = mapPaper(row, conference.id, deletedColIdx);

        // Skip empty rows
        if (!paper.externalSubmissionId || !paper.title) {
            skipped++;
            continue;
        }
        dtos.push(paper);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = [];
        for (const paper of chunk) {
            results.push(await paperRepository.createPaper(paper));
        }
        for (const savedPaper of results) {
            if (savedPaper) imported++;
            else skipped++;
        }
    }

    console.log(`Conference: ${conference.name}`);
    console.log(`Imported papers: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Submissions imported successfully.\n");
}

module.exports = importSubmissions;