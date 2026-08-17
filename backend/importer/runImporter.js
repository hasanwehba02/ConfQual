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

const { setFilePath, runWithFileContext } = require("./workbookReader");

async function runImporter(filePath, meta = {}) {
    const executeImport = async () => {
        if (filePath) {
            setFilePath(filePath);
        }
        
        console.log("Starting ConfQual import...\n");
        
        try {
            await client.withTransaction(async () => {
                const conference = await importConference(meta);

                console.log("");

                await importProgramCommittee(conference);
                await importSubmissions(conference);
                await importAuthors(conference);
                await importAssignments(conference);
                await importBids(conference);
                await importConflicts(conference);
                await importReviews(conference);
                await importComments(conference);
                await importMetaReviews(conference);
                await importTopics(conference);

                console.log("\nImport Complete! All data committed to database.");
            });
        } catch (error) {
            console.error("\nImport Failed!", error);
            throw error;
        }
    };

    if (filePath) {
        return runWithFileContext(filePath, executeImport);
    }
    return executeImport();
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
