const ExcelJS = require("exceljs");
const path = require("path");

async function readWorkbook() {
    const workbook = new ExcelJS.Workbook();

    const filePath = path.join(
        __dirname,
        "..",
        "..",
        "excel",
        "easychair-gran.xlsx"
    );

    await workbook.xlsx.readFile(filePath);

    console.log("Workbook loaded successfully!");

    return workbook;
}

module.exports = readWorkbook;