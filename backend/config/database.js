require("dotenv").config();

const { Pool } = require("pg");

const dbConfig = process.env.DATABASE_URL
    ? { 
        connectionString: process.env.DATABASE_URL,
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

const client = new Pool(dbConfig);

client.connect()
    .then(() => {
        console.log("Connected to PostgreSQL (Pool)");
    })
    .catch((err) => {
        console.error("PostgreSQL connection failed:", err.message);
    });

module.exports = client;