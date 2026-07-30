const { readWorkbook } = require("../workbookReader");
const mapConflict = require("../mappers/conflictMapper");
const conflictService = require("../../services/conflictService");

async function importConflicts() {
    const workbook = await readWorkbook();
    const conflictsSheet = workbook.getWorksheet("Conflicts of interests");

    if (!conflictsSheet) {
        console.log("Conflicts of interests sheet not found. Skipping.");
        return;
    }

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= conflictsSheet.rowCount; i++) {
        const row = conflictsSheet.getRow(i);
        const conflictDto = mapConflict(row);

        if (!conflictDto.externalSubmissionId || !conflictDto.externalPersonId) {
            skipped++;
            continue;
        }
        dtos.push(conflictDto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => conflictService.createConflict(dto.externalSubmissionId, dto.externalPersonId))
        );
        for (const savedConflict of results) {
            if (savedConflict) imported++;
            else skipped++;
        }
    }

    console.log(`Imported conflicts: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Conflicts imported successfully.\n");
}

module.exports = importConflicts;
