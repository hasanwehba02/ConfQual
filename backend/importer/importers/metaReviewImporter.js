const { readWorkbook } = require("../workbookReader");
const mapMetaReview = require("../mappers/metaReviewMapper");
const metaReviewRepository = require("../../repositories/metaReviewRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importMetaReviewsForSheet(workbook, sheetName, conference, _isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap(conference.id);
    const pcmMap = await programCommitteeRepository.getIdMap(conference.id);
    const headerMap = {};
    sheet.getRow(1).eachCell((cell, colNumber) => {
        if (cell.value) {
            headerMap[String(cell.value).trim().toLowerCase()] = colNumber;
        }
    });

    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapMetaReview(row, headerMap);
        if (!dto.externalSubmissionId || !dto.externalPersonId) {
            skipped++;
            continue;
        }
        dto.paperId = paperMap[dto.externalSubmissionId];
        dto.programCommitteeMemberId = pcmMap[dto.externalPersonId];
        if (!dto.paperId || !dto.programCommitteeMemberId) {
            skipped++;
            continue;
        }
        dtos.push(dto);
    }
    const chunkSize = 200;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        imported += await metaReviewRepository.bulkCreateMetaReviews(chunk);
    }
    console.log(`Imported meta-reviews: ${imported}`);
    console.log(`Skipped meta-review rows: ${skipped}`);
}

async function importMetaReviews(conference) {
    const workbook = await readWorkbook();
    const candidateSheets = ["Metareviews", "Meta reviews", "meta reviews", "Metareview", "Meta Reviews", "metareviews"];
    const sheetName = candidateSheets.find(name => workbook.getWorksheet(name));
    if (sheetName) {
        await importMetaReviewsForSheet(workbook, sheetName, conference);
        console.log(`Meta-reviews imported successfully from sheet '${sheetName}'.\n`);
    } else {
        console.log("No meta-reviews sheet found. Skipping.\n");
    }
}

module.exports = importMetaReviews;
