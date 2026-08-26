const { AppError } = require('../utils/appError');

/**
 * Wraps an async route handler so rejections flow to the central error middleware.
 */
function asyncHandler(fn) {
    return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    const status = err instanceof AppError ? err.statusCode : 500;
    const message = err instanceof AppError ? err.message : 'Internal server error';

    if (!(err instanceof AppError)) {
        console.error(`Unhandled error on ${req.method} ${req.originalUrl}:`, err);
    } else if (status >= 500) {
        console.error(`Operational error on ${req.method} ${req.originalUrl}:`, err);
    }

    res.status(status).json({ error: message });
}

module.exports = { asyncHandler, errorHandler };
