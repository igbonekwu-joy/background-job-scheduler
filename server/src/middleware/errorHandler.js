import { StatusCodes } from 'http-status-codes';
import winston from 'winston';
import { AppError } from '../utils/errors.js';

export const errorHandler = (err, req, res, next) => {
    winston.error(err.message, err);

    if (err.isUpstream) {
        return res.status(StatusCodes.BAD_GATEWAY).json({ status: 'error', message: 'Bad Gateway' });
    }

    if (err instanceof AppError) {
        return res.status(err.statusCode).json({ status: 'error', message: err.message });
    }

    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ status: 'error', message: 'Internal Server Error' });

    next();
}