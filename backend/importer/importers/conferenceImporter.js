const client = require("../../config/database");

const CONFERENCE_NAME = "EasyChair Import";

async function importConference() {

    // Check if the conference already exists
    const existingConference = await client.query(
        `
        SELECT *
        FROM conference
        WHERE name = $1;
        `,
        [CONFERENCE_NAME]
    );

    if (existingConference.rows.length > 0) {
        console.log("Conference already exists.");

        return existingConference.rows[0];
    }

    // Otherwise create it
    const result = await client.query(
        `
        INSERT INTO conference (name)
        VALUES ($1)
        RETURNING *;
        `,
        [CONFERENCE_NAME]
    );

    console.log("Conference created.");

    if (result.rows.length === 0) {

        return null;

    }

    return result.rows[0];
}

module.exports = importConference;