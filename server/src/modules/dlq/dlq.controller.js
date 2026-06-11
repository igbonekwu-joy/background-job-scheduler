import { getDlqEntries, getDlqEntryById, retryFromDlq } from "./dlq.service.js";

export const getQueue = async (req, res) => {
    const { page, limit } = req.query;
    const includeResolved = req.query.include_resolved === 'true';
    const parsedLimit = limit ? Math.min(100, Math.max(1, parseInt(limit, 10))) : 10;
    const parsedPage = page ? Math.max(1, parseInt(page, 10)) : 1;
    const linkBase = `${req.protocol}://${req.get('host')}${req.baseUrl}`;

    const entries = await getDlqEntries({
        includeResolved,
        page: parsedPage,
        limit: parsedLimit,
        linkBase,
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