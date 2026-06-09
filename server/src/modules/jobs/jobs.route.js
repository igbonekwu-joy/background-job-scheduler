import express from "express";
import { createJob, getJobById, getJobs } from "./jobs.controller.js";

const router = express.Router();

router.get('/', getJobs);
router.post('/', createJob);
router.get('/:id', getJobById);

export default router;