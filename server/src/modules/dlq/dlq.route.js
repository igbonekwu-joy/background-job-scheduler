import express from "express";
import { getQueue, getQueueById, retryDlq } from "./dlq.controller.js";
import { asyncHandler } from "../../middleware/asyncHandler.js";

const router = express.Router();

router.get('/', asyncHandler(getQueue));
router.get('/:id', asyncHandler(getQueueById));
router.post('/:id/retry', asyncHandler(retryDlq));

export default router;
