/**
 * Standard success response format
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code
 * @param {String} message - Success message
 * @param {Object} data - Response data (optional)
 * @param {String} propertyName - Custom property name for data (optional, defaults to 'data')
 */
const successResponse = (res, statusCode, message, data = null, propertyName = 'data') => {
  const response = { status: true, message };
  if (data) response[propertyName] = data;
  return res.status(statusCode).json(response);
};

/**
 * Standard error response format
 * @param {Object} res - Express response object
 * @param {Number} statusCode - HTTP status code
 * @param {String} message - Error message
 * @param {String} error - Detailed error (optional, shown only in development)
 */
const errorResponse = (res, statusCode, message, error = null) => {
  const response = { status: false, message };
  if (error && process.env.NODE_ENV === 'development') {
    response.error = error;
  }
  return res.status(statusCode).json(response);
};

module.exports = {
  successResponse,
  errorResponse
}; 