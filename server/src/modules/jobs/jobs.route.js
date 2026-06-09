import express from "express";
import { cancelJob, createJob, getJobById, getJobLogs, getJobs, getStats } from "./jobs.controller.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = express.Router();

router.get('/stats', asyncHandler(getStats));
router.get('/', asyncHandler(getJobs));
router.post('/', asyncHandler(createJob));
router.get('/:id', asyncHandler(getJobById));
router.get('/:id/logs', asyncHandler(getJobLogs));
router.patch('/:id/cancel', asyncHandler(cancelJob));

export default router;
