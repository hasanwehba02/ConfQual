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

    for (let i = 2; i <= conflictsSheet.rowCount; i++) {
        const row = conflictsSheet.getRow(i);
        const conflictDto = mapConflict(row);

        if (!conflictDto.externalSubmissionId || !conflictDto.externalPersonId) {
            skipped++;
            continue;
        }

        const savedConflict = await conflictService.createConflict(
            conflictDto.externalSubmissionId,
            conflictDto.externalPersonId
        );

        if (savedConflict) {
            imported++;
        } else {
            skipped++;
        }
    }

    console.log(`Imported conflicts: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Conflicts imported successfully.\n");
}

module.exports = importConflicts;
