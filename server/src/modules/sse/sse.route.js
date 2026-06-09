import express from 'express';
import { asyncHandler } from '../../middleware/asyncHandler.js';
import { getEvents } from './sse.controller.js';

const router = express.Router();

router.get('/', asyncHandler(getEvents));

export default router;
