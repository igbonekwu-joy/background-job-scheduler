import dotenv from 'dotenv';

dotenv.config();

const env = {
    PORT: process.env.PORT || 5000,
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DLQ_ALERT_THRESHOLD: process.env.DLQ_ALERT_THRESHOLD || 10,
    STARVATION_THRESHOLD_MINUTES: process.env.STARVATION_THRESHOLD_MINUTES || 5,
    WORKER_POLL_INTERVAL_MS: process.env.WORKER_POLL_INTERVAL_MS || 2000,
    DLQ_ALERT_EMAIL: process.env.DLQ_ALERT_EMAIL || 'engineering@dilamme.io',
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4173',
}

export default env;