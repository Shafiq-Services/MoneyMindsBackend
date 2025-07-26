//Models
const Banner = require("../models/banner");
const { successResponse, errorResponse } = require("../utils/apiResponse");

/**
 * @description Create Banner
 * @route POST /api/banner/create
 * @access Private
 */
module.exports.createBanner = async (req, res) => {
  const { imageUrl, title, subtitle, description, isActive } = req.body;

  //Error handling
  if (!imageUrl || !title) {
    return res.status(400).json({ message: "ImageUrl and title are required" });
  }

  try {
    // If creating an active banner, deactivate all others first
    if (isActive) {
      await Banner.updateMany({}, { isActive: false });
    }

    const banner = await Banner.create({
      imageUrl,
      title,
      subtitle,
      description,
      isActive: isActive || false,
    });

    //Response
    return successResponse(res, 201, "Banner created successfully", banner);
  } catch (error) {
    return errorResponse(res, 500, "Failed to create banner", error);
  }
};

/**
 * @description Get Banners
 * @route GET /api/banner/get
 * @access Private
 * @query id (optional) - specific banner ID
 */
module.exports.getBanners = async (req, res) => {
  try {
    const { id } = req.query;
    let filter = {};
    
    // If id is provided, filter by that specific banner
    if (id) {
      filter = { _id: id };
    }
    
    const banners = await Banner.find(filter).sort({ isActive: -1, createdAt: -1 }).lean();

    //Response
    return successResponse(res, 200, "Banners retrieved successfully", banners);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get banners", error);
  }
};

/**
 * @description Get Active Banner
 * @route GET /api/banner/active
 * @access Public
 */
module.exports.getActiveBanner = async (req, res) => {
  try {
    const activeBanner = await Banner.findOne({ isActive: true }).lean();

    if (!activeBanner) {
      return successResponse(res, 200, "No active banner found", null);
    }

    //Response
    return successResponse(res, 200, "Active banner retrieved successfully", activeBanner);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get active banner", error);
  }
};

/**
 * @description Edit Banners
 * @route PUT /api/banner/edit?id=banner_id
 * @access Private
 */
module.exports.editBanner = async (req, res) => {
  const { id } = req.query;
  const { imageUrl, title, subtitle, description, isActive } = req.body;

  if (!id) {
    return errorResponse(res, 400, "Banner ID is required in query parameters");
  }

  try {
    // If setting this banner as active, deactivate all others first
    if (isActive) {
      await Banner.updateMany({ _id: { $ne: id } }, { isActive: false });
    }

    const banner = await Banner.findByIdAndUpdate(
      id, 
      {
        imageUrl,
        title,
        subtitle,
        description,
        isActive: isActive !== undefined ? isActive : false,
      },
      { new: true }
    );

    if (!banner) {
      return errorResponse(res, 404, "Banner not found");
    }

    //Response
    return successResponse(res, 200, "Banner updated successfully", banner);
  } catch (error) {
    return errorResponse(res, 500, "Failed to edit banner", error);
  }
};

/**
 * @description Activate Banner (Only activates, never deactivates)
 * @route PUT /api/banner/toggle-active?id=banner_id
 * @access Private
 */
module.exports.toggleBannerActive = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return errorResponse(res, 400, "Banner ID is required in query parameters");
  }

  try {
    // Find the banner first
    const banner = await Banner.findById(id);

    if (!banner) {
      return errorResponse(res, 404, "Banner not found");
    }

    // Always deactivate all other banners first
    await Banner.updateMany({ _id: { $ne: id } }, { isActive: false });
    
    // Always activate this banner (even if it was already active)
    banner.isActive = true;
    await banner.save();
    
    return successResponse(res, 200, "Banner activated successfully", banner);
  } catch (error) {
    return errorResponse(res, 500, "Failed to activate banner", error);
  }
};

/**
 * @description Delete Banners
 * @route DELETE /api/banner/delete?id=banner_id
 * @access Private
 */
module.exports.deleteBanner = async (req, res) => {
  const { id } = req.query;

  if (!id) {
    return errorResponse(res, 400, "Banner ID is required in query parameters");
  }

  try {
    const banner = await Banner.findByIdAndDelete(id);

    if (!banner) {
      return errorResponse(res, 404, "Banner not found");
    }

    //Response
    return successResponse(res, 200, "Banner deleted successfully");
  } catch (error) {
    return errorResponse(res, 500, "Failed to delete banner", error);
  }
};
