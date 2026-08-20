const { readWorkbook } = require("../workbookReader");
const mapBid = require("../mappers/bidMapper");
const bidRepository = require("../../repositories/bidRepository");
const paperRepository = require("../../repositories/paperRepository");
const programCommitteeRepository = require("../../repositories/programCommitteeRepository");

async function importBidsForSheet(workbook, sheetName, conference, _isSuperseded = false) {
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
        const dto = mapBid(row, headerMap);
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
    console.log(`Imported bids: ${imported}`);
    console.log(`Skipped bid rows: ${skipped}`);
}

async function importBids(conference) {
    const workbook = await readWorkbook();
    const candidateSheets = ["Paper bidding", "Paper Bidding", "paper bidding", "Bids", "bids", "Bid", "bid"];
    const sheetName = candidateSheets.find(name => workbook.getWorksheet(name));
    if (sheetName) {
        await importBidsForSheet(workbook, sheetName, conference);
        console.log(`Bids imported successfully from sheet '${sheetName}'.\n`);
    } else {
        console.log("No bids sheet found. Skipping.\n");
    }
}

module.exports = importBids;
