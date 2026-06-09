import express from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { getEvents } from './sse.controller.js';

const router = express.Router();

/**
 * @swagger
 * /sse:
 *   get:
 *     summary: Get SSE events
 *     tags: [Server Side Events]
 *     responses:
 *       200:
 *         description: SSE events returned successfully
 */
router.get('/', asyncHandler(getEvents));

export default router;