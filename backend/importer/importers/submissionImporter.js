const { readWorkbook } = require("../workbookReader");
const mapPaper = require("../mappers/paperMapper");
const paperService = require("../../services/paperService");

async function importSubmissions(conference) {
    const workbook = await readWorkbook();

    const submissionsSheet = workbook.getWorksheet("Submissions");

    let imported = 0;
    let skipped = 0;

    const headerRow = submissionsSheet.getRow(1);
    let deletedColIdx = -1;
    headerRow.eachCell((cell, colNumber) => {
        if (cell.value && cell.value.toString().trim().toLowerCase() === 'deleted') {
            deletedColIdx = colNumber;
        }
    });

    for (let i = 2; i <= submissionsSheet.rowCount; i++) {
        const row = submissionsSheet.getRow(i);

        const paper = mapPaper(row, conference.id, deletedColIdx);

        // Skip empty rows
        if (!paper.externalSubmissionId || !paper.title) {
            skipped++;
            continue;
        }

        const savedPaper = await paperService.createPaper(paper);

        if (savedPaper) {
            imported++;
        } else {
            skipped++;
        }
    }

    console.log(`Conference: ${conference.name}`);
    console.log(`Imported papers: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Submissions imported successfully.\n");
}

module.exports = importSubmissions;