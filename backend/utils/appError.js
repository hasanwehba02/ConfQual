class AppError extends Error {
    /**
     * @param {string} message
     * @param {number} [statusCode=500]
     * @param {boolean} [isOperational=true]
     */
    constructor(message, statusCode = 500, isOperational = true) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        Error.captureStackTrace(this, this.constructor);
    }
}

class NotFoundError extends AppError {
    constructor(message = 'Resource not found') {
        super(message, 404);
    }
}

class ValidationError extends AppError {
    constructor(message = 'Invalid request') {
        super(message, 400);
    }
}

class ForbiddenError extends AppError {
    constructor(message = 'Forbidden') {
        super(message, 403);
    }
}

class ServiceUnavailableError extends AppError {
    constructor(message = 'Service temporarily unavailable') {
        super(message, 503);
    }
}

module.exports = {
    AppError,
    NotFoundError,
    ValidationError,
    ForbiddenError,
    ServiceUnavailableError
};
