const pool = require("../config/database");

async function anonymizeData() {
    try {
        console.log("Starting data anonymization...");

        // 1. Drop author tables if they still exist
        try {
            await pool.query("DROP TABLE IF EXISTS paper_author CASCADE;");
            await pool.query("DROP TABLE IF EXISTS author CASCADE;");
            console.log("- Author tables dropped.");
        } catch (err) {
            console.log("- Author tables drop error:", err.message);
        }

        // 2. Anonymize Program Committee Members
        const pcQuery = "SELECT id FROM program_committee_member";
        const pcResult = await pool.query(pcQuery);
        
        let pcCount = 0;
        for (const row of pcResult.rows) {
            const newFirstName = `PC_First_${row.id}`;
            const newLastName = `PC_Last_${row.id}`;
            const newEmail = `pc_${row.id}@example.com`;
            
            await pool.query(
                "UPDATE program_committee_member SET first_name = $1, last_name = $2, email = $3 WHERE id = $4",
                [newFirstName, newLastName, newEmail, row.id]
            );
            pcCount++;
        }
        console.log(`- Anonymized ${pcCount} PC Members.`);

        // 3. Anonymize Sub-Reviewers in Review table
        const reviewQuery = "SELECT id FROM review WHERE sub_reviewer_person_id IS NOT NULL";
        const reviewResult = await pool.query(reviewQuery);
        
        let subRevCount = 0;
        for (const row of reviewResult.rows) {
            const newFirstName = `SubRev_First_${row.id}`;
            const newLastName = `SubRev_Last_${row.id}`;
            const newEmail = `subrev_${row.id}@example.com`;
            
            await pool.query(
                "UPDATE review SET sub_reviewer_first_name = $1, sub_reviewer_last_name = $2, sub_reviewer_email = $3 WHERE id = $4",
                [newFirstName, newLastName, newEmail, row.id]
            );
            subRevCount++;
        }
        console.log(`- Anonymized ${subRevCount} Sub-reviewers in reviews.`);

        console.log("Data anonymization complete!");
        process.exit(0);
    } catch (err) {
        console.error("Error during data anonymization:", err);
        process.exit(1);
    }
}

anonymizeData();
