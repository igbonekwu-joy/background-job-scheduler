import { getDlqEntries, getDlqEntryById } from "./dlq.service.js";

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