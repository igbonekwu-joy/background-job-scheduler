import express from "express";
import { createJob, getJobById, getJobLogs, getJobs } from "./jobs.controller.js";

const router = express.Router();

router.get('/', getJobs);
router.post('/', createJob);
router.get('/:id', getJobById);
router.get('/:id/logs', getJobLogs);

export default router;