const importConference = require("./importers/conferenceImporter");
const importProgramCommittee = require("./importers/programCommitteeImporter");
const importSubmissions = require("./importers/submissionImporter");
const importAuthors = require("./importers/authorImporter");

async function runImporter() {
    console.log("Starting ConfQual import...\n");

    const conference = await importConference();

    console.log("");

    await importProgramCommittee(conference);

    await importSubmissions(conference);

    await importAuthors();

    console.log("Import completed successfully!");
}

runImporter().catch((err) => {
    console.error("Import failed:");
    console.error(err);
});