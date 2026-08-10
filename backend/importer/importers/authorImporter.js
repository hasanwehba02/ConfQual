const { readWorkbook } = require("../workbookReader");
const mapAuthor = require("../mappers/authorMapper");

const authorRepository = require("../../repositories/authorRepository");
const paperRepository = require("../../repositories/paperRepository");
const paperAuthorRepository = require("../../repositories/paperAuthorRepository");

async function importAuthors() {
    const workbook = await readWorkbook();
    const authorsSheet = workbook.getWorksheet("Authors");

    if (!authorsSheet) {
        console.log("No 'Authors' sheet found. Skipping author import.");
        return;
    }

    let importedAuthors = 0;
    let importedRelationships = 0;
    let skipped = 0;

    let authorOrder = 1;
    let previousSubmissionId = null;

    const dtos = [];
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
        author.externalSubmissionId = submissionId;
        author.authorOrder = authorOrder;
        author.corresponding = row.getCell(8).value === "✔";
        
        dtos.push(author);
        authorOrder++;
    }

    // Step 1: Bulk insert all authors
    const chunkSize = 200;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        importedAuthors += await authorRepository.bulkCreateAuthors(chunk);
    }
    
    // Step 2: Fetch id maps
    const paperMap = await paperRepository.getIdMap();
    const authorMap = await authorRepository.getIdMap();
    
    // Step 3: Map relations and bulk insert paper_authors
    const relations = [];
    for (const dto of dtos) {
        const paperId = paperMap[dto.externalSubmissionId];
        const authorId = authorMap[dto.externalPersonId];
        
        if (!paperId || !authorId) {
            skipped++;
            continue;
        }
        
        relations.push({
            paperId,
            authorId,
            authorOrder: dto.authorOrder,
            corresponding: dto.corresponding
        });
    }
    
    for (let i = 0; i < relations.length; i += chunkSize) {
        const chunk = relations.slice(i, i + chunkSize);
        importedRelationships += await paperAuthorRepository.bulkCreatePaperAuthors(chunk);
    }

    console.log(`Imported authors: ${importedAuthors}`);
    console.log(`Paper-author relations: ${importedRelationships}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Authors imported successfully.\n");
}

module.exports = importAuthors;
