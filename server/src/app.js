import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import cors from 'cors';
import { swaggerOptions } from '../docs/swagger.config.js';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './config/logger.js';
import env from './config/env.js';
import helmet from 'helmet';
import compression from 'compression';
import routes from './routes.js';

const app = express();
env.NODE_ENV === 'production' && app.set('etag', false);;

const allowedOrigins = env.CLIENT_ORIGIN.split(',').map(origin => origin.trim());

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
}));

app.use(express.json());

app.use(helmet());
app.use(compression({
  filter(req, res) {
    if (req.url?.startsWith('/api/events')) return false;
    return compression.filter(req, res);
  },
}));

routes(app);

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

logger();

app.use(errorHandler);

export default app;