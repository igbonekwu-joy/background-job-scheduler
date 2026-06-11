import pg from 'pg';
import winston from 'winston';
import { directPgConfig } from '../config/pgDirect.js';

const CHANNEL = 'job_events';

const notifyPool = new pg.Pool({ ...directPgConfig(), max: 1 });

notifyPool.on('error', (err) => {
  winston.error('Job event notify pool error', { error: err.message });
});

/** Publish from any process (worker, API). Delivered to the API SSE listener. */
export async function publishJobEvent(data) {
  const payload = JSON.stringify(data);
  await notifyPool.query('SELECT pg_notify($1, $2)', [CHANNEL, payload]);
}

let listenerStarted = false;

/** Subscribe once in the API process and forward to SSE clients. */
export async function startJobEventListener(onEvent) {
  if (listenerStarted) return;
  listenerStarted = true;

  const client = new pg.Client(directPgConfig());

  client.on('notification', (msg) => {
    if (msg.channel !== CHANNEL || !msg.payload) return;
    try {
      onEvent(JSON.parse(msg.payload));
    } catch (err) {
      winston.warn('Invalid job event payload', { error: err.message });
    }
  });

  client.on('error', (err) => {
    winston.error('Job event listener connection error', { error: err.message });
  });

  try {
    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    winston.info('Job event listener started');
  } catch (err) {
    listenerStarted = false;
    winston.error('Failed to start job event listener', { error: err.message });
    try { await client.end(); } catch { /* ignore */ }
  }
}
