import express from "express";
import { getQueue, getQueueById, retryDlq } from "./dlq.controller.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = express.Router();

/**
 * @swagger
 * /dlq:
 *   get:
 *     summary: Get entries from the Dead Letter Queue (DLQ)
 *     tags: [Dead Letter Queue]
 *     parameters:
 *      - in: query
 *        name: include_resolved
 *        schema:
 *          type: boolean
 *        required: false
 *        description: Whether to include resolved entries in the response
 *     responses:
 *       200:
 *         description: DLQ entries returned successfully
 */
router.get('/', asyncHandler(getQueue));

/**
 * @swagger
 * /dlq/{id}:
 *   get:
 *     summary: Get a specific entry from the Dead Letter Queue (DLQ)
 *     tags: [Dead Letter Queue]
 *     parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *     responses:
 *       200:
 *         description: DLQ entry returned successfully
 */
router.get('/:id', asyncHandler(getQueueById));


/**
 * @swagger
 * /dlq/{id}/retry:
 *   patch:
 *     summary: Retry a specific entry from the Dead Letter Queue (DLQ)
 *     tags: [Dead Letter Queue]
 *     parameters:
 *      - in: path
 *        name: id
 *        schema:
 *          type: string
 *        required: true
 *     responses:
 *       200:
 *         description: DLQ entry retried successfully
 */
router.post('/:id/retry', asyncHandler(retryDlq));

export default router;