const importConference = require("./importers/conferenceImporter");
const importProgramCommittee = require("./importers/programCommitteeImporter");
const importSubmissions = require("./importers/submissionImporter");
const importAuthors = require("./importers/authorImporter");
const importAssignments = require("./importers/assignmentImporter");
const importBids = require("./importers/bidImporter");
const importConflicts = require("./importers/conflictImporter");
const importReviews = require("./importers/reviewImporter");
const importComments = require("./importers/commentImporter");
const importMetaReviews = require("./importers/metaReviewImporter");
const importTopics = require("./importers/topicImporter");
const client = require("../config/database");

const { setFilePath } = require("./workbookReader");

async function runImporter(filePath) {
    if (filePath) {
        setFilePath(filePath);
    }
    
    console.log("Starting ConfQual import...\n");
    
    try {
        await client.query('BEGIN');
        
        console.log("Wiping existing data...");
        await client.query('TRUNCATE TABLE conference CASCADE;');

        const conference = await importConference();

        console.log("");

    await importProgramCommittee(conference);

    await importSubmissions(conference);

    await importAuthors();

    await importAssignments();

    await importBids();

    await importConflicts();

    await importReviews();

    await importComments();

        await importMetaReviews();

        await importTopics(conference);

        await client.query('COMMIT');
        console.log("\nImport Complete! All data committed to database.");
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("\nImport Failed! Transaction rolled back.", error);
        throw error;
    }
}

module.exports = runImporter;

if (require.main === module) {
    const args = process.argv.slice(2);
    runImporter(args[0]).then(() => {
        process.exit(0);
    }).catch(err => {
        console.error(err);
        process.exit(1);
    });
}