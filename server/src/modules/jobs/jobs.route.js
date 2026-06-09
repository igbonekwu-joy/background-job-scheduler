import express from "express";
import { cancelJob, createJob, getJobById, getJobLogs, getJobs, getStats } from "./jobs.controller.js";

const router = express.Router();

router.get('/stats', getStats);
router.get('/', getJobs);
router.post('/', createJob);
router.get('/:id', getJobById);
router.get('/:id/logs', getJobLogs);
router.patch('/:id/cancel', cancelJob);

export default router;