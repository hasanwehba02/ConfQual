const ExcelJS = require("exceljs");
const path = require("path");

let currentFilePath = null;

function setFilePath(filePath) {
    currentFilePath = filePath;
}

async function readWorkbook() {
    const workbook = new ExcelJS.Workbook();
    
    // Fallback for local testing if no path is provided
    let filePath = currentFilePath;
    if (!filePath) {
        filePath = path.join(
            __dirname,
            "..",
            "..",
            "excel",
            "easychair-gran.xlsx"
        );
    }

    await workbook.xlsx.readFile(filePath);

    console.log(`Workbook loaded successfully from ${filePath}`);

    return workbook;
}

module.exports = { readWorkbook, setFilePath };