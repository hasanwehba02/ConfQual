const { readWorkbook } = require("../workbookReader");
const { mapPcTopic, mapSubmissionTopic } = require("../mappers/topicMapper");
const topicRepository = require("../../repositories/topicRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importPcTopics(workbook, conference) {
    const sheet = workbook.getWorksheet("PC topics");
    if (!sheet) return;

    let imported = 0;
    let skipped = 0;
    const pcmMap = await programCommitteeRepository.getIdMap(conference.id);

    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapPcTopic(row);

        if (!dto.externalPersonId || !dto.topicName) {
            skipped++;
            continue;
        }
        
        dto.pcmId = pcmMap[dto.externalPersonId];
        if (!dto.pcmId) {
            skipped++;
            continue;
        }
        
        dtos.push(dto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        for (const dto of chunk) {
            dto.topicId = await topicRepository.ensureTopicExists(dto.topicName);
        }
        imported += await topicRepository.bulkCreatePcTopics(chunk);
    }

    console.log(`Imported PC topics: ${imported}`);
    console.log(`Skipped PC topic rows: ${skipped}`);
}

async function importSubmissionTopics(workbook, conference) {
    const sheet = workbook.getWorksheet("Submission topics");
    if (!sheet) return;

    let imported = 0;
    let skipped = 0;
    const paperMap = await paperRepository.getIdMap(conference.id);

    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapSubmissionTopic(row);

        if (!dto.externalSubmissionId || !dto.topicName) {
            skipped++;
            continue;
        }
        
        dto.paperId = paperMap[dto.externalSubmissionId];
        if (!dto.paperId) {
            skipped++;
            continue;
        }
        
        dtos.push(dto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        for (const dto of chunk) {
            dto.topicId = await topicRepository.ensureTopicExists(dto.topicName);
        }
        imported += await topicRepository.bulkCreatePaperTopics(chunk);
    }

    console.log(`Imported Submission topics: ${imported}`);
    console.log(`Skipped Submission topic rows: ${skipped}`);
}

async function importTopics(conference) {
    const workbook = await readWorkbook();
    
    await importPcTopics(workbook, conference);
    await importSubmissionTopics(workbook, conference);

    console.log("Topics imported successfully.\n");
}

module.exports = importTopics;
