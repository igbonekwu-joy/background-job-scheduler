import { StatusCodes } from "http-status-codes";
import { fetchJobById, fetchJobs, saveJob } from "./jobs.service.js";
import { validateCreateJob } from "./jobs.validator.js";

export const createJob = async (req, res) => {
    const { type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 0, dependencies = [] } = req.body;

    // Validation
    const validated = validateCreateJob({ type, payload, priority, scheduled_at, recurring_interval, max_retries, dependencies });
    if (validated.error) {
        return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ status: 'error', error: validated.error });
    }

    const result = await saveJob(validated);
    res.status(StatusCodes.CREATED).json(result.data);
}

export const getJobs = async (req, res) => {
    const { status, limit, offset } = req.query;
    const jobs = await fetchJobs({
        status,
        limit:  limit  ? parseInt(limit)  : 100,
        offset: offset ? parseInt(offset) : 0,
    });

    res.status(jobs.statusCode).json(jobs.data);
};

export const getJobById = async (req, res) => {
    const job = await fetchJobById(req.params.id);
    if (!job) return res.status(StatusCodes.NOT_FOUND).json({ status: 'error', message: 'Job not found' });

    res.status(job.statusCode).json(job.data);
}