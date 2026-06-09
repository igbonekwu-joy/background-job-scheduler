import express from 'express';

const app = express();

app.use(express.json());

app.use(helmet());
app.use(compression()); 

export default app;