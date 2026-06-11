import { StatusCodes } from "http-status-codes";
import { fetchJobById, fetchJobs, saveJob, fetchAllJobLogs, fetchJobLogs, cancelJobById, fetchStats } from "./jobs.service.js";
import { validateCreateJob } from "./jobs.validator.js";
import { linkBaseFromReq, parsePagination, toPaginatedBody } from "../../utils/apiResponse.js";

export const createJob = async (req, res) => {
    const { type, payload, priority = 2, scheduled_at, recurring_interval, max_retries = 3, dependencies = [] } = req.body;

    const validated = validateCreateJob({ type, payload, priority, scheduled_at, recurring_interval, max_retries, dependencies });
    if (validated.error) {
        return res.status(StatusCodes.UNPROCESSABLE_ENTITY).json({ status: 'error', error: validated.error });
    }

    const job = await saveJob(validated);
    res.status(StatusCodes.CREATED).json({
        status: 'success',
        message: 'Job created successfully',
        job,
    });
}

export const getJobs = async (req, res) => {
    const { status } = req.query;
    const { page, limit } = parsePagination(req.query, 20);

    const result = await fetchJobs({ status, page, limit });

    res.status(StatusCodes.OK).json(toPaginatedBody({
        rows: result.rows,
        page: result.page,
        limit: result.limit,
        totalCount: result.total_jobs,
        countKey: 'total_jobs',
        linkBase: linkBaseFromReq(req),
        status,
    }));
};

export const getJobById = async (req, res) => {
    const job = await fetchJobById(req.params.id);
    res.status(StatusCodes.OK).json({ status: 'success', job });
}

export const getJobLogs = async (req, res) => {
    const { event, level } = req.query;
    const { page, limit } = parsePagination(req.query, 20);
    const linkBase = linkBaseFromReq(req, `/${req.params.id}/logs`);

    const result = req.params.id === 'all'
        ? await fetchAllJobLogs({ event, level, page, limit })
        : await fetchJobLogs(req.params.id, { event, level, page, limit });

    res.status(StatusCodes.OK).json(toPaginatedBody({
        rows: result.rows,
        page: result.page,
        limit: result.limit,
        totalCount: result.total_logs,
        countKey: 'total_logs',
        linkBase,
        filters: result.filters,
    }));
}

export const cancelJob = async (req, res) => {
    const job = await cancelJobById(req.params.id);
    res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'Job cancelled successfully',
        job,
    });
}

export const getStats = async (req, res) => {
    const stats = await fetchStats();
    res.status(StatusCodes.OK).json({ status: 'success', stats });
}
