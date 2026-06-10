import express from "express";
import jobsRoutes from "./modules/jobs/jobs.route.js";
import dlqRoutes from "./modules/dlq/dlq.route.js";
import sseRoutes from "./modules/sse/sse.route.js";
import { StatusCodes } from "http-status-codes";

export default function routes(app) {
    const prefix = '/api';
    app.use(express.json());
    app.use(express.urlencoded({extended: true})); 

    app.use(`${prefix}/jobs`, jobsRoutes);
    app.use(`${prefix}/dlq`, dlqRoutes);
    app.use(`${prefix}/events`, sseRoutes);

    app.get('/health', (req, res) => {
        res.status(StatusCodes.OK).json({ status: 'ok', uptime: process.uptime() });
    });
}