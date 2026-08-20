const { readWorkbook } = require("../workbookReader");
const { mapPcTopic, mapSubmissionTopic } = require("../mappers/topicMapper");
const topicRepository = require("../../repositories/topicRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importPcTopics(workbook, conference) {
    const candidateSheets = ["PC topics", "PC Topics", "pc topics", "pc_topics", "Reviewer topics"];
    const sheetName = candidateSheets.find(name => workbook.getWorksheet(name));
    if (!sheetName) return;
    const sheet = workbook.getWorksheet(sheetName);

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

    const uniqueTopics = [...new Set(dtos.map(d => d.topicName))];
    const topicMap = {};
    for (const name of uniqueTopics) {
        topicMap[name] = await topicRepository.ensureTopicExists(name);
    }

    for (const dto of dtos) {
        dto.topicId = topicMap[dto.topicName];
    }

    const chunkSize = 200;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        imported += await topicRepository.bulkCreatePcTopics(chunk);
    }

    console.log(`Imported PC topics: ${imported}`);
    console.log(`Skipped PC topic rows: ${skipped}`);
}

async function importSubmissionTopics(workbook, conference) {
    const candidateSheets = ["Submission topics", "Submission Topics", "submission topics", "submission_topics", "Paper topics"];
    const sheetName = candidateSheets.find(name => workbook.getWorksheet(name));
    if (!sheetName) return;
    const sheet = workbook.getWorksheet(sheetName);

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

    const uniqueTopics = [...new Set(dtos.map(d => d.topicName))];
    const topicMap = {};
    for (const name of uniqueTopics) {
        topicMap[name] = await topicRepository.ensureTopicExists(name);
    }

    for (const dto of dtos) {
        dto.topicId = topicMap[dto.topicName];
    }

    const chunkSize = 200;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
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
