const { readWorkbook } = require("../workbookReader");
const mapAssignment = require("../mappers/assignmentMapper");
const assignmentService = require("../../services/assignmentService");

async function importAssignments() {
    const workbook = await readWorkbook();
    const assignmentsSheet = workbook.getWorksheet("Submission assignment");

    if (!assignmentsSheet) {
        console.log("Submission assignment sheet not found. Skipping.");
        return;
    }

    let imported = 0;
    let skipped = 0;

    const dtos = [];
    for (let i = 2; i <= assignmentsSheet.rowCount; i++) {
        const row = assignmentsSheet.getRow(i);
        const assignmentDto = mapAssignment(row);

        if (!assignmentDto.externalSubmissionId || !assignmentDto.externalPersonId) {
            skipped++;
            continue;
        }
        dtos.push(assignmentDto);
    }

    const chunkSize = 30;
    for (let i = 0; i < dtos.length; i += chunkSize) {
        const chunk = dtos.slice(i, i + chunkSize);
        const results = await Promise.all(
            chunk.map(dto => assignmentService.createAssignment(dto.externalSubmissionId, dto.externalPersonId))
        );
        for (const savedAssignment of results) {
            if (savedAssignment) imported++;
            else skipped++;
        }
    }

    console.log(`Imported assignments: ${imported}`);
    console.log(`Skipped rows: ${skipped}`);
    console.log("Assignments imported successfully.\n");
}

module.exports = importAssignments;
