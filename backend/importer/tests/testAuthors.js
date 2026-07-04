const readWorkbook = require("../workbookReader");

async function main() {
    const workbook = await readWorkbook();

    const authorsSheet = workbook.getWorksheet("Authors");

    console.log("\n===== AUTHORS SHEET =====\n");

    console.log("Columns:");

    const headers = [];

    authorsSheet.getRow(1).eachCell((cell) => {
        headers.push(cell.value);
    });

    console.table(headers);

    console.log("\nFirst three rows:\n");

    for (let i = 2; i <= 4; i++) {
        const row = authorsSheet.getRow(i);

        console.log(row.values.slice(1));
    }
}

main().catch(console.error);