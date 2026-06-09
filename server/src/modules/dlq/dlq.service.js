import { StatusCodes } from "http-status-codes";
import pool from "../../config/database.js";

export const getDlqEntries = async (options) => {
    const { rows } = await pool.query(
        `SELECT * FROM dead_letter_queue
        ${options.includeResolved ? '' : 'WHERE resolved = FALSE'}
        ORDER BY failed_at DESC
        LIMIT $1`,
        [options.limit]
    );

    return { statusCode: StatusCodes.OK, data: { success: true, count: rows.length, data: rows } };
}

export const getDlqEntryById = async (id) => {
    const { rows: [entry] } = await pool.query(
        `SELECT * FROM dead_letter_queue WHERE id = $1`,
        [id]
    );
    if (!entry) {
        return { statusCode: StatusCodes.NOT_FOUND, data: { status: 'error', message: 'DLQ entry not found' } };
    }

    return { statusCode: StatusCodes.OK, data: { success: true, data: entry  } };
}