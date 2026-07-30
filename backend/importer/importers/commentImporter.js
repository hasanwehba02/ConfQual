const { readWorkbook } = require("../workbookReader");
const mapComment = require("../mappers/commentMapper");
const commentService = require("../../services/commentService");

async function importComments() {
    const workbook = await readWorkbook();
    const commentsSheet = workbook.getWorksheet("Comments");

    if (!commentsSheet) {
        console.log("Comments sheet not found. Skipping.");
        return;
    }

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= commentsSheet.rowCount; i++) {
        const row = commentsSheet.getRow(i);
        const commentDto = mapComment(row);

        if (!commentDto.externalSubmissionId || !commentDto.externalPersonId) {
            skipped++;
            continue;
        }
        dtos.push(commentDto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => commentService.createComment(dto))
        );
        for (const savedComment of results) {
            if (savedComment) imported++;
            else skipped++;
        }
    }

    console.log(`Imported comments: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Comments imported successfully.\n");
}

module.exports = importComments;
