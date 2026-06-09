import express from "express";
import jobsRoutes from "./modules/jobs/jobs.route.js";

export default function routes(app) {
    app.use(express.json());
    app.use(express.urlencoded({extended: true})); 

    app.use('/jobs', jobsRoutes);
}