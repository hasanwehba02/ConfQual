require("dotenv").config();

const { Pool } = require("pg");
const { AsyncLocalStorage } = require("async_hooks");

let connStr = process.env.DATABASE_URL;
if (connStr && !connStr.includes('uselibpqcompat')) {
    connStr += (connStr.includes('?') ? '&' : '?') + 'uselibpqcompat=true';
}

const dbConfig = connStr
    ? { 
        connectionString: connStr,
        ssl: { rejectUnauthorized: false },
        max: 20
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        max: 20
    };

const pool = new Pool(dbConfig);
const als = new AsyncLocalStorage();

// Handle idle client errors to prevent the application from crashing
pool.on('error', (err, _client) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

pool.connect()
    .then((client) => {
        console.log("Connected to PostgreSQL (Pool)");
        client.release();
    })
    .catch((err) => {
        console.error("PostgreSQL connection failed:", err.message);
    });

// Proxy the pool so we can intercept `.query` calls and route them to the active transaction client if it exists.
const clientProxy = new Proxy(pool, {
    get: function (target, prop, receiver) {
        if (prop === 'query') {
            return function (...args) {
                const txClient = als.getStore();
                if (txClient) {
                    return txClient.query(...args);
                }
                return target.query(...args);
            };
        }
        if (prop === 'withTransaction') {
            return async function (callback) {
                const connection = await target.connect();
                try {
                    await connection.query('BEGIN');
                    // Run the callback inside the AsyncLocalStorage context
                    const result = await als.run(connection, () => callback(connection));
                    await connection.query('COMMIT');
                    return result;
                } catch (err) {
                    await connection.query('ROLLBACK');
                    throw err;
                } finally {
                    connection.release();
                }
            };
        }
        
        // Pass through everything else (like .connect(), .end(), etc)
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
    }
});

module.exports = clientProxy;