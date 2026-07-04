const readWorkbook = require("../workbookReader");
const mapPaper = require("../mappers/paperMapper");

async function main() {
    const workbook = await readWorkbook();

    const submissionsSheet = workbook.getWorksheet("Submissions");

    console.log("\n===== PAPER OBJECTS =====\n");

    // Start from row 2 because row 1 contains the headers
    for (let i = 2; i <= submissionsSheet.rowCount; i++) {
        const row = submissionsSheet.getRow(i);

        const paper = mapPaper(row);

        console.log(paper);

        // Only print the first 5 papers for now
        if (i === 6) break;
    }
}

main().catch(console.error);