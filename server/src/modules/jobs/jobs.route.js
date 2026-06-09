import express from "express";
import { createJob } from "./jobs.controller.js";

const router = express.Router();

router.post('/', createJob);

export default router;