import express from 'express';
import { errorHandler } from './middleware/errorHandler';

const app = express();

app.use(express.json());

app.use(helmet());
app.use(compression()); 

app.use(errorHandler);

export default app;