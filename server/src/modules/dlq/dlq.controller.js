import { getDlqEntries } from "./dlq.service.js";

export const getQueue = async (req, res) => {
    const includeResolved = req.query.include_resolved === 'true';
    const entries = await getDlqEntries({
        includeResolved,
        limit: req.query.limit ? parseInt(req.query.limit) : 100,
    });

    res.status(entries.statusCode).json(entries.data);
}