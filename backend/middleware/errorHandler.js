const { AppError } = require('../utils/appError');

/**
 * Wraps an async route handler so rejections flow to the central error middleware.
 */
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const isUploadLimit = err?.name === 'MulterError';
    const status = err instanceof AppError
        ? err.statusCode
        : isUploadLimit
            ? 400
            : Number.isInteger(err?.status) && err.status >= 400 && err.status < 500
                ? err.status
                : 500;
    const message = err instanceof AppError
        ? err.message
        : isUploadLimit
            ? 'Invalid or oversized upload'
            : status === 413
                ? 'Request payload is too large'
                : status < 500
                    ? 'Invalid request'
                    : 'Internal server error';

    if (status >= 500 && !(err instanceof AppError)) {
        console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
    } else if (status >= 500) {
        console.error(`Operational error on ${req.method} ${req.originalUrl}:`, err);
    }

    res.status(status).json({ error: message });
}

module.exports = { asyncHandler, errorHandler };
