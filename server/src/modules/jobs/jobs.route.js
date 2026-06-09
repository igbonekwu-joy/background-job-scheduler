import express from "express";
import { cancelJob, createJob, getJobById, getJobLogs, getJobs, getStats } from "./jobs.controller.js";

const router = express.Router();

/**
 * @swagger
 * /jobs/stats:
 *   get:
 *     summary: Get job statistics
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Stats returned successfully
 */
router.get('/stats', getStats);

/**
 * @swagger
 * /jobs:
 *   get:
 *     summary: Get a list of jobs with optional filtering and pagination
 *     tags: [Jobs]
 *     parameters:  
 *      - in: query
 *        name: status
 *        schema:
 *          type: string
 *          enum: [pending, processing, completed, failed, cancelled]
 *        required: false
 *      - in: query
 *        name: limit
 *        schema:
 *          type: integer
 *        required: false
 *      - in: query
 *        name: offset
 *        schema:
 *          type: integer
 *        required: false
 *     responses:
 *       200:
 *         description: Jobs returned successfully
 */
router.get('/', getJobs);

/**
 * @swagger
 * /jobs:
 *   post:
 *     summary: Create a new job
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: './jobs.controller.js'
 *     responses:
 *       201:
 *         description: Job created successfully
 */
router.post('/', createJob);

/** @swagger
 * /jobs/{id}:
 *   get:
 *     summary: Get a job by ID
 *     tags: [Jobs]
 *     parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *     responses:
 *       200:
 *         description: Job returned successfully
 */
router.get('/:id', getJobById);

/** @swagger
 * /jobs/{id}/logs:
 *   get:
 *     summary: Get logs for a specific job
 *     tags: [Jobs]
 *     parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *      - in: query
 *        name: limit
 *        schema:
 *          type: integer
 *        required: false
 *     responses:
 *       200:
 *         description: Logs returned successfully
 */
router.get('/:id/logs', getJobLogs);

/** @swagger
 * /jobs/{id}/cancel:
 *   patch:
 *     summary: Cancel a job by ID
 *     tags: [Jobs]
 *     parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *     responses:
 *       200:
 *         description: Job cancelled successfully
 */
router.patch('/:id/cancel', cancelJob);

export default router;