/**
 * @swagger
 * /api/jobs/stats:
 *   get:
 *     summary: Get job statistics
 *     tags: [Jobs]
 *     responses:
 *       200:
 *         description: Aggregated job counts by status
 */

/**
 * @swagger
 * /api/jobs:
 *   get:
 *     summary: List jobs with optional filtering and pagination
 *     tags: [Jobs]
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           $ref: '#/components/schemas/api/jobstatus'
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Paginated list of jobs
 */

/**
 * @swagger
 * /api/jobs:
 *   post:
 *     summary: Create a new job
 *     tags: [Jobs]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateJobRequest'
 *     responses:
 *       201:
 *         description: Job created successfully
 *       422:
 *         description: Validation failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */

/**
 * @swagger
 * /api/jobs/{id}:
 *   get:
 *     summary: Get a job by ID
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job details
 *       404:
 *         description: Job not found
 */

/**
 * @swagger
 * /api/jobs/{id}/logs:
 *   get:
 *     summary: Get execution logs for a job
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *     responses:
 *       200:
 *         description: Job log entries
 *       404:
 *         description: Job not found
 */

/**
 * @swagger
 * /api/jobs/{id}/cancel:
 *   patch:
 *     summary: Cancel a pending or processing job
 *     tags: [Jobs]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Job cancelled successfully
 *       404:
 *         description: Job not found
 */
