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

    for (let i = 2; i <= commentsSheet.rowCount; i++) {
        const row = commentsSheet.getRow(i);
        const commentDto = mapComment(row);

        if (!commentDto.externalSubmissionId || !commentDto.externalPersonId) {
            skipped++;
            continue;
        }

        const savedComment = await commentService.createComment(commentDto);

        if (savedComment) {
            imported++;
        } else {
            skipped++;
        }
    }

    console.log(`Imported comments: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Comments imported successfully.\n");
}

module.exports = importComments;
