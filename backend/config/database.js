require("dotenv").config();

const { Pool } = require("pg");
const { AsyncLocalStorage } = require("async_hooks");

let connStr = process.env.DATABASE_URL;

// SSL certificate validation. Managed Postgres providers (e.g. Supabase pooler)
// often use chains not in Node's CA store. To enable full validation, either
// point DB_SSL_CA_PATH at the provider's CA certificate, or set
// DB_SSL_REJECT_UNAUTHORIZED=false to explicitly accept unvalidated TLS.
const sslRejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false';
const fs = require("fs");
const caPath = process.env.DB_SSL_CA_PATH;
const sslConfig = {
    rejectUnauthorized: caPath ? true : sslRejectUnauthorized,
    ...(caPath ? { ca: fs.readFileSync(caPath).toString() } : {})
};
const useSsl = process.env.DB_SSL !== 'false';

const dbConfig = connStr
    ? {
        connectionString: connStr,
        ...(useSsl ? { ssl: sslConfig } : {}),
        max: 20
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: process.env.DB_SSL === 'true' ? sslConfig : undefined,
        max: 20
    };

const pool = new Pool(dbConfig);
const als = new AsyncLocalStorage();

async function applyWorkspaceScope(connection, workspaceId) {
    await connection.query('SET LOCAL ROLE confqual_app');
    await connection.query(
        "SELECT set_config('app.current_workspace_id', $1, true)",
        [workspaceId]
    );
}

async function runScopedQuery(target, workspaceId, args) {
    const connection = await target.connect();
    try {
        await connection.query('BEGIN');
        await applyWorkspaceScope(connection, workspaceId);
        const result = await connection.query(...args);
        await connection.query('COMMIT');
        return result;
    } catch (error) {
        await connection.query('ROLLBACK');
        throw error;
    } finally {
        connection.release();
    }
}

// Handle idle client errors to prevent the application from crashing
pool.on('error', (err, _client) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
});

pool.on('connect', () => {
    console.log("Connected to PostgreSQL (Pool)");
});

// Proxy the pool so we can intercept `.query` calls and route them to the active transaction client if it exists.
const clientProxy = new Proxy(pool, {
    get: function (target, prop, receiver) {
        if (prop === 'query') {
            return function (...args) {
                const store = als.getStore();
                if (store?.client) {
                    return store.client.query(...args);
                }
                if (store?.workspaceId) {
                    return runScopedQuery(target, store.workspaceId, args);
                }
                return target.query(...args);
            };
        }
        if (prop === 'withTransaction') {
            return async function (callback) {
                const parentStore = als.getStore();
                if (parentStore?.client) {
                    return callback(parentStore.client);
                }
                const connection = await target.connect();
                try {
                    await connection.query('BEGIN');
                    if (parentStore?.workspaceId) {
                        await applyWorkspaceScope(connection, parentStore.workspaceId);
                    }
                    const store = { ...parentStore, client: connection };
                    const result = await als.run(store, () => callback(connection));
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
        if (prop === 'withWorkspace') {
            return function (workspaceId, callback) {
                const parentStore = als.getStore();
                return als.run({ ...parentStore, workspaceId }, callback);
            };
        }
        if (prop === 'getWorkspaceId') {
            return function () {
                return als.getStore()?.workspaceId || null;
            };
        }

        // Pass through everything else (like .connect(), .end(), etc)
        const value = Reflect.get(target, prop, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
    }
});

module.exports = clientProxy;
