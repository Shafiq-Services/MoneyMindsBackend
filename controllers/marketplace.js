//Models
const Marketplace = require("../models/marketplace");
const { successResponse, errorResponse } = require("../utils/apiResponse");

/**
 * @description Create Marketplace
 * @route POST /api/marketplace/create
 * @access Private
 */
module.exports.createMarketplace = async (req, res) => {
  const { image, discount, discountCode, link } = req.body;

  //Error handling
  if (!image || !discount || !discountCode || !link) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    await Marketplace.create({
      image,
      discount,
      discountCode,
      link,
    });

    //Response
    return successResponse(res, 201, "Marketplace created successfully");
  } catch (error) {
    return errorResponse(res, 500, "Failed to create marketplace", error);
  }
};

/**
 * @description Get Marketplaces
 * @route GET /api/marketplace/get
 * @access Private
 */
module.exports.getMarketplaces = async (req, res) => {
  try {
    const marketplaces = await Marketplace.find({})
      .sort({ createdAt: -1 })
      .lean();

    //Response
    return successResponse(
      res,
      200,
      "Marketplaces retrieved successfully",
      marketplaces
    );
  } catch (error) {
    return errorResponse(res, 500, "Failed to get marketplaces", error);
  }
};

/**
 * @description Edit Marketplaces
 * @route PUT /api/marketplace/edit/:id
 * @access Private
 */
module.exports.editMarketplace = async (req, res) => {
  const { id } = req.params;
  const { image, discount, discountCode, link } = req.body;

  try {
    const marketplace = await Marketplace.findByIdAndUpdate(id, {
      image,
      discount,
      discountCode,
      link,
    });

    if (!marketplace) {
      return errorResponse(res, 404, "Marketplace not found");
    }

    //Response
    return successResponse(
      res,
      200,
      "Marketplace updated successfully",
      marketplace
    );
  } catch (error) {
    return errorResponse(res, 500, "Failed to edit marketplace", error);
  }
};

/**
 * @description Delete Marketplaces
 * @route DELETE /api/marketplace/delete/:id
 * @access Private
 */
module.exports.deleteMarketplace = async (req, res) => {
  const { id } = req.params;

  try {
    const marketplace = await Marketplace.findByIdAndDelete(id);

    if (!marketplace) {
      return errorResponse(res, 404, "Marketplace not found");
    }

    //Response
    return successResponse(res, 200, "Marketplace deleted successfully");
  } catch (error) {
    return errorResponse(res, 500, "Failed to delete marketplace", error);
  }
};
