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
const paperRepository = require("../repositories/paperRepository");
const participantRepository = require("../repositories/participantRepository");

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

                // These two must run first — they populate the researcher/participant/paper tables
                await importProgramCommittee(conference);
                await importSubmissions(conference);
                await importAuthors(conference);

                // Build shared lookup maps ONCE after foundational tables are populated.
                // All downstream importers receive these maps to avoid redundant SELECT queries.
                const context = {
                    paperMap:       await paperRepository.getIdMap(conference.id),
                    participantMap: await participantRepository.getParticipantIdMap(conference.id),
                    deferSentiment: true
                };

                await importAssignments(conference, context);
                await importBids(conference, context);
                await importConflicts(conference, context);
                await importReviews(conference, context);
                await importComments(conference, context);
                await importMetaReviews(conference, context);
                await importTopics(conference, context);

                console.log("\nImport Complete! All data committed to database.");
            });

            // Deferred sentiment enrichment — runs after COMMIT so HTTP response is not blocked
            setImmediate(async () => {
                try {
                    const { batchAnalyzeReviewSentiment } = require("../utils/analyticsMath");
                    const rows = await client.query(`SELECT id, review_text FROM review WHERE sentiment_score IS NULL OR sentiment_score = 0 ORDER BY id`);
                    if (rows.rows.length > 0) {
                        const scores = await batchAnalyzeReviewSentiment(rows.rows.map(r => r.review_text || ''));
                        for (let i = 0; i < rows.rows.length; i++) {
                            const sc = scores[i] || 0;
                            if (sc !== 0) await client.query(`UPDATE review SET sentiment_score=$1 WHERE id=$2`, [sc, rows.rows[i].id]);
                        }
                        console.log(`Deferred sentiment updated ${rows.rows.length} reviews`);
                    }
                } catch (e) {
                    console.warn('Deferred sentiment failed:', e.message);
                }
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

