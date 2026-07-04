const readWorkbook = require("../workbookReader");

async function main() {
    const workbook = await readWorkbook();

    const programCommitteeSheet = workbook.getWorksheet("Program committee");

    console.log("\n===== PROGRAM COMMITTEE SHEET =====\n");

    console.log("Columns:");

    const headers = [];

    programCommitteeSheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value);
    });

    console.table(headers);

    console.log("\nFirst three rows:\n");

    for (let i = 2; i <= 4; i++) {
        const row = programCommitteeSheet.getRow(i);

        console.log(row.values.slice(1));
    }
}

main().catch(console.error);