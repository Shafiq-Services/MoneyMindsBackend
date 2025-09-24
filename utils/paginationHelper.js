/**
 * Parse pagination parameters for admin APIs
 * @param {string|number} page - Page number
 * @param {string|number} limit - Items per page limit
 * @returns {Object} - Pagination parameters
 */
const parsePaginationParams = (page = 1, limit = 10) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Max 100 items per page
  const skip = (pageNum - 1) * limitNum;
  
  return {
    page: pageNum,
    limit: limitNum,
    skip
  };
};

/**
 * Create pagination response object
 * @param {number} page - Current page
 * @param {number} limit - Items per page
 * @param {number} total - Total items
 * @returns {Object} - Pagination response
 */
const createPaginationResponse = (page, limit, total) => {
  const totalPages = Math.ceil(total / limit);
  
  return {
    page,
    limit,
    total,
    pages: totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1
  };
};

module.exports = {
  parsePaginationParams,
  createPaginationResponse
};
