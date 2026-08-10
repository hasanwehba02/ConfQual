const { readWorkbook } = require("../workbookReader");
const mapBid = require("../mappers/bidMapper");
const bidRepository = require("../../repositories/bidRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importBidsForSheet(workbook, sheetName, isSuperseded = false) {
    const sheet = workbook.getWorksheet(sheetName);
    if (!sheet) return;
    const paperMap = await paperRepository.getIdMap();
    const pcmMap = await programCommitteeRepository.getIdMap();
    let imported = 0;
    let skipped = 0;
    const dtos = [];
    for (let i = 2; i <= sheet.rowCount; i++) {
        const row = sheet.getRow(i);
        const dto = mapBid(row);
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
        imported += await bidRepository.bulkCreateBids(chunk);
    }
    console.log();
}

async function importBids() {
    const workbook = await readWorkbook();
    await importBidsForSheet(workbook, "Bids");
    console.log("bid imported successfully.\n");
}

module.exports = importBids;
