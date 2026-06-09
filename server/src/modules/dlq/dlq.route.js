import express from "express";
import { getQueue } from "./dlq.controller.js";

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
router.get('/', getQueue);

router.get('/:id', (req, res) => {});

export default router;