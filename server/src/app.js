import express from 'express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { swaggerOptions } from '../docs/swagger.config.js';
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

const specs = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(specs));

logger();

app.use(errorHandler);

export default app;