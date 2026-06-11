import winston from 'winston';
import pool from '../config/database.js';

export const up = async () => {
  winston.info('Adding name column to jobs table...');

  await pool.query(`
    ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS name VARCHAR(200);
  `);
};

export const down = async () => {
  winston.info('Dropping name column from jobs table...');

  await pool.query(`
    ALTER TABLE jobs DROP COLUMN IF EXISTS name;
  `);
};
