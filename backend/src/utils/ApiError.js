class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  static badRequest(message, details) { return new ApiError(400, 'VALIDATION_ERROR', message, details); }
  static unauthorized(message = 'Sign in to continue.') { return new ApiError(401, 'UNAUTHORIZED', message); }
  static forbidden(message = 'You do not have access to this.') { return new ApiError(403, 'FORBIDDEN', message); }
  static notFound(what = 'Resource') { return new ApiError(404, 'NOT_FOUND', `${what} not found.`); }
  static conflict(code, message) { return new ApiError(409, code, message); }
}
module.exports = ApiError;
