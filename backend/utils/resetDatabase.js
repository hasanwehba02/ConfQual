const client = require('../config/database');

async function resetDatabase() {
    await client.withTransaction(async (connection) => {
        await connection.query('DELETE FROM note');
        await connection.query('DELETE FROM conference_series');
        await connection.query('DELETE FROM researcher');
        await connection.query('DELETE FROM topic');
        await connection.query('DELETE FROM settings');
    });
}

module.exports = resetDatabase;
