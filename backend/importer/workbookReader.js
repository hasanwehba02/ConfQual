const ExcelJS = require("exceljs");
const path = require("path");

const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();

function setFilePath(filePath) {
    const store = als.getStore();
    if (store) {
        store.filePath = filePath;
    }
}

async function readWorkbook() {
    const workbook = new ExcelJS.Workbook();
    
    const store = als.getStore();
    let filePath = store?.filePath;
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

function runWithFileContext(filePath, callback) {
    return als.run({ filePath }, callback);
}

module.exports = { readWorkbook, setFilePath, runWithFileContext };
