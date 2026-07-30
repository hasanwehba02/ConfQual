const { readWorkbook } = require("../workbookReader");
const { mapPcTopic, mapSubmissionTopic } = require("../mappers/topicMapper");
const topicService = require("../../services/topicService");

async function importPcTopics(workbook) {
    const sheet = workbook.getWorksheet("PC topics");
    if (!sheet) return;

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapPcTopic(row);

        if (!dto.externalPersonId || !dto.topicName) {
            skipped++;
            continue;
        }
        dtos.push(dto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => topicService.createPcTopic(dto))
        );
        for (const saved of results) {
            if (saved) imported++;
            else skipped++;
        }
    }

    console.log(`Imported PC topics: ${imported}`);
    console.log(`Skipped PC topic rows: ${skipped}`);
}

async function importSubmissionTopics(workbook) {
    const sheet = workbook.getWorksheet("Submission topics");
    if (!sheet) return;

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapSubmissionTopic(row);

        if (!dto.externalSubmissionId || !dto.topicName) {
            skipped++;
            continue;
        }
        dtos.push(dto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => topicService.createPaperTopic(dto))
        );
        for (const saved of results) {
            if (saved) imported++;
            else skipped++;
        }
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
