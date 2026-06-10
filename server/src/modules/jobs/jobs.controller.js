import { StatusCodes } from "http-status-codes";
import { fetchJobById, fetchJobs, saveJob, fetchJobLogs, cancelJobById, fetchStats } from "./jobs.service.js";
import { validateCreateJob } from "./jobs.validator.js";

export const createJob = async (req, res) => {
    const { type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 3, dependencies = [] } = req.body;

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

    res.status(job.statusCode).json(job.data);
}

export const getJobLogs = async (req, res) => {
    const logs = await fetchJobLogs(req.params.id, {
      limit: req.query.limit ? parseInt(req.query.limit) : 200
    });

    res.status(logs.statusCode).json(logs.data);
}

export const cancelJob = async (req, res) => {
    const job = await cancelJobById(req.params.id);

    res.status(job.statusCode).json(job.data);
}

export const getStats = async (req, res) => {
    const stats = await fetchStats();
    res.status(stats.statusCode).json(stats.data);
}