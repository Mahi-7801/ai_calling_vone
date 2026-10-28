class AppError extends Error {
  constructor(message, status = 400, code = null, details = null) {
    super(message);
    this.status = status;
    this.code = code || `ERR_${status}`;
    this.details = details;
    this.isOperational = true;
  }
}

function notFound(req, res, next) {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, 'NOT_FOUND'));
}

function errorHandler(err, req, res, _next) {
  const status = err.status || 500;

  // Infrastructure outages (DB down, provider unreachable) are already logged
  // once at the source with an actionable message. Dumping the full error again
  // here just buries the real cause under a wall of stack traces.
  const infraCodes = ['DB_UNAVAILABLE', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH'];
  const isInfra = infraCodes.includes(err.code);

  if (isInfra) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${err.code}: ${err.message}`);
  } else if (!err.isOperational || status >= 500) {
    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);
  }

  if (res.headersSent) return;
  res.status(status).json({
    success: false,
    error: {
      message: err.message || 'Internal server error',
      code: err.code,
      details: err.details,
    },
  });
}

module.exports = { AppError, notFound, errorHandler };