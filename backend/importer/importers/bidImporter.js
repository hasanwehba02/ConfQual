const { readWorkbook } = require("../workbookReader");
const mapBid = require("../mappers/bidMapper");
const bidService = require("../../services/bidService");

async function importBids() {
    const workbook = await readWorkbook();
    const bidsSheet = workbook.getWorksheet("Paper bidding");

    if (!bidsSheet) {
        console.log("Paper bidding sheet not found. Skipping.");
        return;
    }

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= bidsSheet.rowCount; i++) {
        const row = bidsSheet.getRow(i);
        const bidDto = mapBid(row);

        if (!bidDto.externalSubmissionId || !bidDto.externalPersonId) {
            skipped++;
            continue;
        }
        dtos.push(bidDto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => bidService.createBid(dto.externalSubmissionId, dto.externalPersonId, dto.bid))
        );
        for (const savedBid of results) {
            if (savedBid) imported++;
            else skipped++;
        }
    }

    console.log(`Imported bids: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Bids imported successfully.\n");
}

module.exports = importBids;
