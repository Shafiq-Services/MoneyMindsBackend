// Pagination utility functions

/**
 * Parse and validate pagination parameters
 * @param {Object} query - Request query object
 * @returns {Object} - Parsed pagination params
 */
const parsePaginationParams = (query) => {
  const page = Math.max(1, parseInt(query.pageNo) || 1);
  const perPage = Math.min(50, Math.max(1, parseInt(query.itemsPerPage) || 10)); // Max 50 items per page
  const skip = (page - 1) * perPage;
  
  return { page, perPage, skip };
};

/**
 * Get random items with pagination and deduplication
 * @param {Object} model - Mongoose model
 * @param {Object} filter - MongoDB filter object
 * @param {Object} pagination - Pagination params
 * @param {Array} populate - Fields to populate
 * @returns {Object} - Paginated random results
 */
const getRandomPaginated = async (model, filter = {}, pagination, populate = []) => {
  const { page, perPage, skip } = pagination;
  
  // Get total count
  const totalCount = await model.countDocuments(filter);
  
  if (totalCount === 0) {
    return {
      data: [],
      pagination: {
        page,
        perPage,
        totalCount: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: false
      }
    };
  }
  
  // Calculate total pages
  const totalPages = Math.ceil(totalCount / perPage);
  
  // For randomization, we'll use aggregation pipeline
  let pipeline = [
    { $match: filter },
    { $sample: { size: Math.min(totalCount, perPage * page) } }, // Sample more items to ensure uniqueness
    { $skip: skip },
    { $limit: perPage }
  ];
  
  let query = model.aggregate(pipeline);
  
  // Apply population if needed
  if (populate.length > 0) {
    for (const pop of populate) {
      query = query.lookup(pop);
    }
  }
  
  const data = await query.exec();
  
  return {
    data,
    pagination: {
      page,
      perPage,
      totalCount,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1
    }
  };
};

/**
 * Get a single random document
 * @param {Object} model - Mongoose model
 * @param {Object} filter - MongoDB filter object
 * @param {Array} populate - Fields to populate
 * @returns {Object} - Single random document
 */
const getRandomSingle = async (model, filter = {}, populate = []) => {
  let query = model.aggregate([
    { $match: filter },
    { $sample: { size: 1 } }
  ]);
  
  const result = await query.exec();
  
  if (result.length === 0) {
    return null;
  }
  
  let document = result[0];
  
  // Manual population if needed
  if (populate.length > 0) {
    document = await model.populate(document, populate);
  }
  
  return document;
};

module.exports = {
  parsePaginationParams,
  getRandomPaginated,
  getRandomSingle
}; 