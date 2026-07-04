const readWorkbook = require("../workbookReader");
const mapAuthor = require("../mappers/authorMapper");

const authorService = require("../../services/authorService");
const paperService = require("../../services/paperService");
const paperAuthorService = require("../../services/paperAuthorService");

async function importAuthors() {
    const workbook = await readWorkbook();

    const authorsSheet = workbook.getWorksheet("Authors");

    let importedAuthors = 0;
    let importedRelationships = 0;
    let skipped = 0;

    let authorOrder = 1;
    let previousSubmissionId = null;

    for (let i = 2; i <= authorsSheet.rowCount; i++) {
        const row = authorsSheet.getRow(i);

        const submissionId = row.getCell(1).value;

        if (!submissionId) {
            skipped++;
            continue;
        }

        if (submissionId !== previousSubmissionId) {
            authorOrder = 1;
            previousSubmissionId = submissionId;
        }

        const author = mapAuthor(row);

        await authorService.createAuthor(author);

        const savedAuthor = await authorService.findByExternalPersonId(
            author.externalPersonId
        );

        const paper = await paperService.findByExternalSubmissionId(
            submissionId
        );

        if (!paper || !savedAuthor) {
            skipped++;
            continue;
        }

        const relation = await paperAuthorService.createPaperAuthor(
            paper.id,
            savedAuthor.id,
            authorOrder,
            row.getCell(8).value === "✔"
        );

        if (relation) {
            importedRelationships++;
        }

        importedAuthors++;

        authorOrder++;
    }

    console.log(`Imported authors: ${importedAuthors}`);
    console.log(`Paper-author relations: ${importedRelationships}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Authors imported successfully.\n");
}

module.exports = importAuthors;