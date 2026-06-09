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