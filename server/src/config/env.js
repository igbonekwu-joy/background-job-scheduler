import dotenv from 'dotenv';

dotenv.config();

const env = {
    PORT: process.env.PORT || 5000,
    DATABASE_URL: process.env.DATABASE_URL,
    CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://localhost:4173',
}

export default env;