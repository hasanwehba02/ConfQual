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

async function runImporter() {
    console.log("Starting ConfQual import...\n");

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

    await importTopics();

    console.log("Import completed successfully!");
}

runImporter()
    .catch((err) => {
        console.error("Import failed:");
        console.error(err);
    })
    .finally(() => {
        client.end();
    });