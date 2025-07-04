//Models
const Banner = require("../models/banner");
const { successResponse, errorResponse } = require("../utils/apiResponse");

/**
 * @description Create Banner
 * @route POST /api/banner/create
 * @access Private
 */
module.exports.createBanner = async (req, res) => {
  const { image, link } = req.body;

  //Error handling
  if (!image || !link) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const banner = await Banner.create({
      image,
      link,
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
 */
module.exports.getBanners = async (req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 }).lean();

    //Response
    return successResponse(res, 200, "Banners retrieved successfully", banners);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get banners", error);
  }
};

/**
 * @description Edit Banners
 * @route PUT /api/banner/edit/:id
 * @access Private
 */
module.exports.editBanner = async (req, res) => {
  const { id } = req.params;
  const { image, link } = req.body;

  try {
    const banner = await Banner.findByIdAndUpdate(id, {
      image,
      link,
    });

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
 * @description Delete Banners
 * @route DELETE /api/banner/delete/:id
 * @access Private
 */
module.exports.deleteBanner = async (req, res) => {
  const { id } = req.params;

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
