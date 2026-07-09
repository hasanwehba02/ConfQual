const runImporter = require('../importer/runImporter');
const path = require('path');

const filePath = path.join(__dirname, '../scratch/conf2_data.xlsx');

const resetDatabase = require('../utils/resetDatabase');

async function testImport() {
    try {
        await resetDatabase();
        await runImporter(filePath);
        console.log('Import successful!');
    } catch (e) {
        console.error('Import failed:', e);
    }
}

testImport();
