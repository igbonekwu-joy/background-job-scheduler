import express from "express";
import jobsRoutes from "./modules/jobs/jobs.route.js";
import dlqRoutes from "./modules/dlq/dlq.route.js";
import sseRoutes from "./modules/sse/sse.route.js";
import { StatusCodes } from "http-status-codes";

export default function routes(app) {
    app.use(express.json());
    app.use(express.urlencoded({extended: true})); 

    app.use('/jobs', jobsRoutes);
    app.use('/dlq', dlqRoutes);
    app.use('/sse', sseRoutes);

    app.get('/health', (req, res) => {
        res.status(StatusCodes.OK).json({ status: 'ok', uptime: process.uptime() });
    });
}