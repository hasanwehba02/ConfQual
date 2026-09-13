const { readWorkbook } = require("../workbookReader");
const mapAuthor = require("../mappers/authorMapper");
const researcherRepository = require("../../repositories/researcherRepository");
const participantRepository = require("../../repositories/participantRepository");
const paperRepository = require("../../repositories/paperRepository");
const paperAuthorRepository = require("../../repositories/paperAuthorRepository");

async function importAuthors(edition) {
    const workbook = await readWorkbook();
    const candidateSheets = ["Authors", "authors", "Author", "author", "Authors sheet"];
    const sheetName = candidateSheets.find(name => workbook.getWorksheet(name));
    if (!sheetName) {
        console.log("No 'Authors' sheet found. Skipping author import.");
        return;
    }
    const authorsSheet = workbook.getWorksheet(sheetName);

    const headerMap = {};
    authorsSheet.getRow(1).eachCell((cell, colNumber) => {
        if (cell.value) {
            headerMap[String(cell.value).trim().toLowerCase()] = colNumber;
        }
    });

    let importedAuthors = 0;
    let importedRelationships = 0;
    let skipped = 0;

    let authorOrder = 1;
    let previousSubmissionId = null;

    const subCol = headerMap['submission #'] || 1;
    const corrCol = headerMap['corresponding?'] || headerMap['corresponding'] || 8;

    const dtos = [];
    for (let i = 2; i <= authorsSheet.rowCount; i++) {
        const row = authorsSheet.getRow(i);
        const submissionId = row.getCell(subCol).value;

        if (!submissionId) {
            skipped++;
            continue;
        }

        if (submissionId !== previousSubmissionId) {
            authorOrder = 1;
            previousSubmissionId = submissionId;
        }

        const author = mapAuthor(row, headerMap);
        author.externalSubmissionId = submissionId;
        author.authorOrder = authorOrder;
        const corrVal = row.getCell(corrCol).value;
        author.corresponding = corrVal === "✔" || corrVal === "yes" || corrVal === true;

        dtos.push(author);
        authorOrder++;
    }

    const chunkSize = 500;

    // Step 1: Find or create researchers and participants (bulk path)
    const paperMap = await paperRepository.getIdMap(edition.id);
    const participantMap = {}; // externalPersonId -> participantId
    const participantIds = [];

    // Deduplicate by externalPersonId before bulk ops
    const uniqueByExtId = new Map(); // externalPersonId -> first dto with that id
    for (const dto of dtos) {
        if (!dto.externalPersonId) { skipped++; continue; }
        if (!uniqueByExtId.has(dto.externalPersonId)) {
            uniqueByExtId.set(dto.externalPersonId, dto);
        }
    }
    const uniqueDtos = [...uniqueByExtId.values()];

    // Bulk find-or-create researchers (2 queries for email rows + 1 per no-email row)
    const researcherItems = uniqueDtos.map(dto => ({
        firstName:   dto.firstName,
        lastName:    dto.lastName,
        email:       dto.email,
        country:     dto.country,
        affiliation: dto.affiliation,
        webPage:     dto.webPage
    }));
    const researcherMap = await researcherRepository.bulkFindOrCreateResearchers(researcherItems);
    // researcherMap: index → researcher

    // Bulk find-or-create participants (2 queries)
    const participantInputs = [];
    for (let i = 0; i < uniqueDtos.length; i++) {
        const researcher = researcherMap.get(i);
        if (!researcher) { skipped++; continue; }
        participantInputs.push({
            researcherId:     researcher.id,
            editionId:        edition.id,
            externalPersonId: uniqueDtos[i].externalPersonId
        });
    }
    const participantByExtId = await participantRepository.bulkFindOrCreateParticipants(participantInputs);
    // participantByExtId: externalPersonId → participant row

    for (const [extId, participant] of participantByExtId) {
        participantMap[extId] = participant.id;
        participantIds.push(participant.id);
        importedAuthors++;
    }

    // Bulk create author roles for all participants in this edition
    if (participantIds.length > 0) {
        await participantRepository.bulkCreateAuthorParticipants(participantIds);
    }

    // Step 2: Map relations and bulk insert paper_authors
    const relations = [];
    for (const dto of dtos) {
        const paperId = paperMap[dto.externalSubmissionId];
        const participantId = participantMap[dto.externalPersonId];

        if (!paperId || !participantId) {
            skipped++;
            continue;
        }

        relations.push({
            paperId,
            participantId,
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
