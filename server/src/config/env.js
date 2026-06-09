import dotenv from 'dotenv';

dotenv.config();

const env = {
    PORT: process.env.PORT || 5000,
}

export default env;