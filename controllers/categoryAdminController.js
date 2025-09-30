const ChatCategory = require('../models/chat-category');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { parsePaginationParams } = require('../utils/paginationHelper');

/**
 * Get all categories with pagination and filtering
 * @route GET /api/admin/category/list
 * @access Admin
 */
const getAllCategories = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query.page, req.query.limit);
    const { search, sortBy = 'createdAt', sortOrder = 'desc' } = req.query;

    // Build filter object
    const filter = {};
    if (search) {
      filter.slug = { $regex: search, $options: 'i' };
    }

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const categories = await ChatCategory.find(filter)
      .populate('createdBy', 'firstName lastName email')
      .sort(sort)
      .limit(limit)
      .skip(skip)
      .lean();

    const totalCategories = await ChatCategory.countDocuments(filter);

    return successResponse(res, 200, 'Categories retrieved successfully', {
      categories,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalCategories / limit),
        totalItems: totalCategories,
        itemsPerPage: limit,
        hasNextPage: (page * limit) < totalCategories,
        hasPrevPage: page > 1
      }
    }, 'categoriesFetched');

  } catch (error) {
    console.error('Error fetching categories:', error);
    return errorResponse(res, 500, 'Failed to fetch categories', error.message);
  }
};

/**
 * Update category by ID
 * @route PUT /api/admin/category/update
 * @access Admin
 */
const updateCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.query;
    const { slug } = req.body;

    if (!categoryId) {
      return errorResponse(res, 400, 'Category ID is required');
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return errorResponse(res, 400, 'Invalid categoryId format. Must be a valid 24-character ObjectId');
    }

    if (!slug) {
      return errorResponse(res, 400, 'Slug is required');
    }

    // Check if category exists
    const existingCategory = await ChatCategory.findById(categoryId);
    if (!existingCategory) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Check if new slug already exists (if changed)
    if (slug.toUpperCase() !== existingCategory.slug) {
      const duplicateCategory = await ChatCategory.findOne({ 
        slug: slug.toUpperCase(),
        _id: { $ne: categoryId }
      });
      if (duplicateCategory) {
        return errorResponse(res, 400, 'Category with this slug already exists');
      }
    }

    // Update category
    const updatedCategory = await ChatCategory.findByIdAndUpdate(
      categoryId,
      { 
        slug: slug.toUpperCase().trim()
      },
      { new: true, runValidators: true }
    ).populate('createdBy', 'firstName lastName email');

    return successResponse(res, 200, 'Category updated successfully', updatedCategory, 'categoryUpdated');

  } catch (error) {
    console.error('Error updating category:', error);
    return errorResponse(res, 500, 'Failed to update category', error.message);
  }
};

/**
 * Delete category by ID
 * @route DELETE /api/admin/category/delete
 * @access Admin
 */
const deleteCategoryById = async (req, res) => {
  try {
    const { categoryId } = req.query;

    if (!categoryId) {
      return errorResponse(res, 400, 'Category ID is required');
    }

    // Validate ObjectId format
    const mongoose = require('mongoose');
    if (!mongoose.Types.ObjectId.isValid(categoryId)) {
      return errorResponse(res, 400, 'Invalid categoryId format. Must be a valid 24-character ObjectId');
    }

    // Check if category exists
    const existingCategory = await ChatCategory.findById(categoryId);
    if (!existingCategory) {
      return errorResponse(res, 404, 'Category not found');
    }

    // Check if category is being used by any channels
    const Channel = require('../models/channel');
    const channelsUsingCategory = await Channel.countDocuments({ category: categoryId });
    
    if (channelsUsingCategory > 0) {
      return errorResponse(res, 400, `Cannot delete category. It is being used by ${channelsUsingCategory} channel(s)`);
    }

    // Delete category
    await ChatCategory.findByIdAndDelete(categoryId);

    return successResponse(res, 200, 'Category deleted successfully', { 
      deletedCategoryId: categoryId,
      deletedSlug: existingCategory.slug
    }, 'categoryDeleted');

  } catch (error) {
    console.error('Error deleting category:', error);
    return errorResponse(res, 500, 'Failed to delete category', error.message);
  }
};

/**
 * Create new category
 * @route POST /api/admin/category/create
 * @access Admin
 */
const createCategory = async (req, res) => {
  try {
    const { slug } = req.body;

    if (!slug || !slug.trim()) {
      return errorResponse(res, 400, 'Category slug is required');
    }

    const normalizedSlug = slug.toUpperCase().trim();

    // Check if category with this slug already exists
    const existingCategory = await ChatCategory.findOne({ slug: normalizedSlug });
    if (existingCategory) {
      return errorResponse(res, 400, 'Category with this slug already exists');
    }

    // Create the category
    const newCategory = await ChatCategory.create({
      slug: normalizedSlug,
      createdBy: null // Admin created, no specific user
    });

    console.log(`✅ [Admin] Created new category: ${newCategory.slug}`);

    return successResponse(res, 201, 'Category created successfully', newCategory, 'categoryCreated');

  } catch (error) {
    console.error('Error creating category:', error);
    return errorResponse(res, 500, 'Failed to create category', error.message);
  }
};

module.exports = {
  getAllCategories,
  createCategory,
  updateCategoryById,
  deleteCategoryById
};
