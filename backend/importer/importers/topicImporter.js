const { readWorkbook } = require("../workbookReader");
const { mapPcTopic, mapSubmissionTopic } = require("../mappers/topicMapper");
const topicService = require("../../services/topicService");

async function importPcTopics(workbook) {
    const sheet = workbook.getWorksheet("PC topics");
    if (!sheet) return;

    let imported = 0;
    let skipped = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapPcTopic(row);

        if (!dto.externalPersonId || !dto.topicName) {
            skipped++;
            continue;
        }

        const saved = await topicService.createPcTopic(dto);
        if (saved) imported++;
        else skipped++;
    }

    console.log(`Imported PC topics: ${imported}`);
    console.log(`Skipped PC topic rows: ${skipped}`);
}

async function importSubmissionTopics(workbook) {
    const sheet = workbook.getWorksheet("Submission topics");
    if (!sheet) return;

    let imported = 0;
    let skipped = 0;

    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapSubmissionTopic(row);

        if (!dto.externalSubmissionId || !dto.topicName) {
            skipped++;
            continue;
        }

        const saved = await topicService.createPaperTopic(dto);
        if (saved) imported++;
        else skipped++;
    }

    console.log(`Imported Submission topics: ${imported}`);
    console.log(`Skipped Submission topic rows: ${skipped}`);
}

async function importTopics() {
    const workbook = await readWorkbook();
    
    await importPcTopics(workbook);
    await importSubmissionTopics(workbook);

    console.log("Topics imported successfully.\n");
}

module.exports = importTopics;
