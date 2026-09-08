const pool = require("../config/database");

async function anonymizeData() {
    try {
        console.log("Starting data anonymization...");

        // 1. Anonymize Researchers
        const researcherResult = await pool.query("SELECT id FROM researcher");
        let researcherCount = 0;

        for (const row of researcherResult.rows) {
            const newFirstName = `Researcher_${row.id}`;
            const newLastName = "";
            const newEmail = `researcher_${row.id}@example.com`;
            const anonName = `Researcher_${row.id}`;

            await pool.query(
                "UPDATE researcher SET first_name = $1, last_name = $2, email = $3, web_page = NULL WHERE id = $4",
                [newFirstName, newLastName, newEmail, row.id]
            );

            await pool.query(
                `INSERT INTO anonymised_researcher (researcher_id, anon_name)
                 VALUES ($1, $2)
                 ON CONFLICT (researcher_id)
                 DO UPDATE SET anon_name = EXCLUDED.anon_name`,
                [row.id, anonName]
            );

            researcherCount++;
        }
        console.log(`- Anonymized ${researcherCount} Researchers.`);

        // 2. Anonymize Sub-Reviewers in Review table
        const reviewResult = await pool.query(
            "SELECT id FROM review WHERE sub_reviewer_person_id IS NOT NULL OR sub_reviewer_first_name IS NOT NULL"
        );
        let subRevCount = 0;

        for (const row of reviewResult.rows) {
            const newFirstName = `SubRev_${row.id}`;
            const newLastName = "";
            const newEmail = `subrev_${row.id}@example.com`;

            await pool.query(
                `UPDATE review
                 SET sub_reviewer_first_name = $1,
                     sub_reviewer_last_name = $2,
                     sub_reviewer_email = $3
                 WHERE id = $4`,
                [newFirstName, newLastName, newEmail, row.id]
            );
            subRevCount++;
        }
        console.log(`- Anonymized ${subRevCount} Sub-reviewers in reviews.`);

        console.log("Data anonymization complete!");
        if (require.main === module) {
            process.exit(0);
        }
    } catch (err) {
        console.error("Error during data anonymization:", err);
        if (require.main === module) {
            process.exit(1);
        }
        throw err;
    }
}

if (require.main === module) {
    anonymizeData();
}

module.exports = anonymizeData;
