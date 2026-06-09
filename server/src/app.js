import express from 'express';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './config/logger.js';
import helmet from 'helmet';
import compression from 'compression';
import routes from './routes.js';

const app = express();

app.use(express.json());

app.use(helmet());
app.use(compression()); 

routes(app);
logger();

app.use(errorHandler);

export default app;