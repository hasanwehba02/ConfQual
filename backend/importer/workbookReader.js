const ExcelJS = require("exceljs");
const path = require("path");

const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();

function setFilePath(filePath) {
    const store = als.getStore();
    if (store) {
        store.filePath = filePath;
        store.workbook = null;
    }
}

async function readWorkbook() {
    const store = als.getStore();
    if (store && store.workbook) {
        return store.workbook;
    }

    const workbook = new ExcelJS.Workbook();
    
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

    if (store) {
        store.workbook = workbook;
    }

    return workbook;
}

function runWithFileContext(filePath, callback) {
    return als.run({ filePath, workbook: null }, callback);
}

module.exports = { readWorkbook, setFilePath, runWithFileContext };
