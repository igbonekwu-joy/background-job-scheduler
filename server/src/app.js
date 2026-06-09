import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { errorHandler } from './middleware/errorHandler.js';
import logger from './config/logger.js';
import helmet from 'helmet';
import compression from 'compression';
import routes from './routes.js';

const app = express();

const options = {
  definition: {
    openapi: '3.0.0',
    info: { title: 'Background Jobs API', version: '1.0.0' },
  },
  apis: ['./src/modules/**/*.route.js'],
};

app.use(express.json());

app.use(helmet());
app.use(compression()); 

routes(app);

const specs = swaggerJsdoc(options);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

logger();

app.use(errorHandler);

export default app;