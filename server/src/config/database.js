import {  Pool } from 'pg';
import env from './env.js';
import winston from 'winston';

const pool = new Pool({
    connectionString: env.DATABASE_URL,
});

pool.on("error", (err) => {
    winston.error("Unexpected error on idle client", err);
    process.exit(-1);
});

pool.on("connect", () => {
    //winston.info("Database connection established");
});

export default pool;    