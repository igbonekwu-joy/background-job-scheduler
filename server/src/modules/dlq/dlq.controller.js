import { getDlqEntries, getDlqEntryById, retryFromDlq } from "./dlq.service.js";

export const getQueue = async (req, res) => {
    const includeResolved = req.query.include_resolved === 'true';
    const entries = await getDlqEntries({
        includeResolved,
        limit: req.query.limit ? parseInt(req.query.limit) : 100,
    });

    res.status(entries.statusCode).json(entries.data);
}

export const getQueueById = async (req, res) => {
    const entry = await getDlqEntryById(req.params.id);

    res.status(entry.statusCode).json(entry.data);
}

export const retryDlq = async (req, res) => {
    const retriedBy = req.body?.retried_by || 'engineer';
    const result = await retryFromDlq(req.params.id, retriedBy);

    return res.status(result.statusCode).json(result.data);
}