//Models
const Feed = require("../models/feed");
const { successResponse, errorResponse } = require("../utils/apiResponse");

/**
 * @description Create Feed
 * @route POST /api/feed/create
 * @access Public
 */
module.exports.createFeed = async (req, res) => {
  const { text, image } = req.body;

  try {
    const feed = await Feed.create({ text, image });

    //Response
    return successResponse(res, 201, "Feed created successfully", feed);
  } catch (error) {
    return errorResponse(res, 500, "Failed to create feed", error);
  }
};

/**
 * @description Edit Feed
 * @route PUT /api/feed/edit/:id
 * @access Public
 */
module.exports.editFeed = async (req, res) => {
  const { id } = req.params;
  const { text, image } = req.body;

  try {
    const feed = await Feed.findByIdAndUpdate(id, { text, image });

    if (!feed) {
      return errorResponse(res, 404, "Feed not found");
    }

    //Response
    return successResponse(res, 200, "Feed updated successfully", feed);
  } catch (error) {
    return errorResponse(res, 500, "Failed to edit feed", error);
  }
};

/**
 * @description Delete Feed
 * @route DELETE /api/feed/delete/:id
 * @access Public
 */
module.exports.deleteFeed = async (req, res) => {
  const { id } = req.params;

  try {
    const feed = await Feed.findByIdAndDelete(id);

    if (!feed) {
      return errorResponse(res, 404, "Feed not found");
    }

    //Response
    return successResponse(res, 200, "Feed deleted successfully");
  } catch (error) {
    return errorResponse(res, 500, "Failed to delete feed", error);
  }
};

/**
 * @description Get Admin Feeds
 * @route GET /api/feed/admin/get
 * @access Public
 */
module.exports.getAdminFeeds = async (req, res) => {
  try {
    const feeds = await Feed.find({}).sort({ createdAt: -1 }).lean();

    //Response
    return successResponse(res, 200, "Feeds retrieved successfully", feeds);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get feeds", error);
  }
};

/**
 * @description Get User Feeds
 * @route GET /api/feed/user/get
 * @access Public
 */
module.exports.getUserFeeds = async (req, res) => {
  const userId = req.userId;

  try {
    const feeds = await Feed.find({}).sort({ createdAt: -1 }).lean();

    const updatedFeeds = feeds.map((feed) => {
      const isLiked = feed.likes.some(
        (like) => like.toString() === userId.toString()
      );
      return {
        ...feed,
        isLiked,
      };
    });

    //Response
    return successResponse(res, 200, "Feeds retrieved successfully", {
      feeds: updatedFeeds,
    });
  } catch (error) {
    return errorResponse(res, 500, "Failed to get feeds", error);
  }
};
