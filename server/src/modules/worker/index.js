import 'dotenv/config';
import winston from 'winston';
import scheduler from '../scheduler/scheduler.js';
import logger from '../../config/logger.js';
import { defaultWorker } from './worker.js';

logger();

const { processJob } = defaultWorker;

function poll() {
  const job = scheduler.next();

  if (job) {
    processJob(job).catch(err =>
      winston.error('Unhandled processJob error', { job_id: job.id, error: err.message })
    );
  }

  setTimeout(poll, job ? 100 : 500);
}

scheduler.start();
poll();
winston.info('Worker started');
