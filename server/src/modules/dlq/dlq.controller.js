import { StatusCodes } from "http-status-codes";
import { getDlqEntries, getDlqEntryById, retryFromDlq } from "./dlq.service.js";
import { linkBaseFromReq, parsePagination, toPaginatedBody } from "../../utils/apiResponse.js";

export const getQueue = async (req, res) => {
    const includeResolved = req.query.include_resolved === 'true';
    const { page, limit } = parsePagination(req.query, 10);

    const result = await getDlqEntries({ includeResolved, page, limit });

    const filters = {};
    if (includeResolved) filters.include_resolved = 'true';

    res.status(StatusCodes.OK).json(toPaginatedBody({
        rows: result.rows,
        page: result.page,
        limit: result.limit,
        totalCount: result.total_dlq,
        countKey: 'total_dlq',
        linkBase: linkBaseFromReq(req),
        filters,
    }));
}

export const getQueueById = async (req, res) => {
    const entry = await getDlqEntryById(req.params.id);
    res.status(StatusCodes.OK).json({ success: true, data: entry });
}

export const retryDlq = async (req, res) => {
    const retriedBy = req.body?.retried_by || 'engineer';
    const { payload } = req.body ?? {};
    const { job, dlqEntry } = await retryFromDlq(req.params.id, { retriedBy, payload });

    res.status(StatusCodes.OK).json({
        status: 'success',
        message: 'Job retried successfully',
        job,
        dlqEntry,
    });
}
