const { logger } = require('../utils/logger');

/**
 * Global error handler middleware
 * Handles all errors thrown in the application
 */
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error details
  logger.error('Error occurred:', {
    message: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user._id : null
  });

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = { message, statusCode: 404 };
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    const message = `${field} already exists`;
    error = { message, statusCode: 400 };
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message).join(', ');
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    const message = 'Invalid token';
    error = { message, statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    const message = 'Token expired';
    error = { message, statusCode: 401 };
  }

  // Multer errors (file upload)
  if (err.code === 'LIMIT_FILE_SIZE') {
    const message = 'File too large';
    error = { message, statusCode: 400 };
  }

  if (err.code === 'LIMIT_UNEXPECTED_FILE') {
    const message = 'Unexpected file field';
    error = { message, statusCode: 400 };
  }

  // Express validator errors
  if (err.type === 'entity.parse.failed') {
    const message = 'Invalid JSON payload';
    error = { message, statusCode: 400 };
  }

  // Rate limit errors
  if (err.status === 429) {
    const message = 'Too many requests';
    error = { message, statusCode: 429 };
  }

  // Default error
  const statusCode = error.statusCode || err.statusCode || 500;
  const message = error.message || 'Server Error';

  // Don't leak error details in production
  const response = {
    error: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    })
  };

  res.status(statusCode).json(response);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Not found middleware
 * Handles 404 errors
 */
const notFound = (req, res, next) => {
  const error = new Error(`Route not found - ${req.originalUrl}`);
  error.statusCode = 404;
  next(error);
};

/**
 * Validation error handler
 * Handles validation errors from express-validator
 */
const handleValidationErrors = (req, res, next) => {
  const errors = req.validationErrors();
  if (errors) {
    const error = new Error('Validation failed');
    error.statusCode = 400;
    error.details = errors;
    return next(error);
  }
  next();
};

/**
 * Performance monitoring middleware
 * Logs request processing time
 */
const performanceMonitor = (req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    const { method, url } = req;
    const { statusCode } = res;
    
    logger.info(`Request processed: ${method} ${url} - ${statusCode} (${duration}ms)`);
    
    // Log slow requests
    if (duration > 1000) {
      logger.warn(`Slow request detected: ${method} ${url} took ${duration}ms`);
    }
  });
  
  next();
};

/**
 * Request logging middleware
 * Logs incoming requests
 */
const requestLogger = (req, res, next) => {
  logger.info(`Incoming request: ${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user ? req.user._id : null
  });
  next();
};

module.exports = {
  errorHandler,
  asyncHandler,
  notFound,
  handleValidationErrors,
  performanceMonitor,
  requestLogger
}; 