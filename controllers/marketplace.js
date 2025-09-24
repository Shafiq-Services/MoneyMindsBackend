//Models
const Marketplace = require("../models/marketplace");
const { successResponse, errorResponse } = require("../utils/apiResponse");

/**
 * @description Create Marketplace
 * @route POST /api/marketplace/create
 * @access Private
 */
module.exports.createMarketplace = async (req, res) => {
  const { title, description, image, discount, discountCode, link, isActive = true } = req.body;

  //Error handling
  if (!title || !image || !discount || !discountCode || !link) {
    return res.status(400).json({ message: "Title, image, discount, discount code, and link are required" });
  }

  try {
    const marketplace = await Marketplace.create({
      title,
      description: description || '',
      image,
      discount,
      discountCode,
      link,
      isActive
    });

    // Format response according to node-api-structure
    const responseData = {
      _id: marketplace._id,
      title: marketplace.title,
      description: marketplace.description,
      image: marketplace.image,
      discount: marketplace.discount,
      discountCode: marketplace.discountCode,
      link: marketplace.link,
      isActive: marketplace.isActive,
      createdAt: marketplace.createdAt
    };

    return successResponse(
      res,
      201,
      "Marketplace offer created successfully",
      responseData,
      'marketplaceOffer'
    );
  } catch (error) {
    return errorResponse(res, 500, "Failed to create marketplace offer", error.message);
  }
};

/**
 * @description Get Marketplaces
 * @route GET /api/marketplace/get
 * @access Private
 */
module.exports.getMarketplaces = async (req, res) => {
  try {
    const { isActive } = req.query;
    
    // Build filter - show only active by default for public API
    const filter = {};
    if (isActive !== undefined) {
      filter.isActive = isActive === 'true';
    } else {
      // For public API, only show active offers
      filter.isActive = true;
    }

    const marketplaces = await Marketplace.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    // Format response according to node-api-structure
    const responseData = marketplaces.map(marketplace => ({
      _id: marketplace._id,
      title: marketplace.title,
      description: marketplace.description,
      image: marketplace.image,
      discount: marketplace.discount,
      discountCode: marketplace.discountCode,
      link: marketplace.link,
      isActive: marketplace.isActive,
      createdAt: marketplace.createdAt
    }));

    return successResponse(
      res,
      200,
      "Marketplace offers retrieved successfully",
      responseData,
      'marketplaceOffers'
    );
  } catch (error) {
    return errorResponse(res, 500, "Failed to get marketplace offers", error.message);
  }
};

/**
 * @description Edit Marketplaces
 * @route PUT /api/marketplace/edit/:id
 * @access Private
 */
module.exports.editMarketplace = async (req, res) => {
  const { marketplaceId } = req.query;
  const { title, description, image, discount, discountCode, link, isActive } = req.body;

  if (!marketplaceId) {
    return errorResponse(res, 400, "Marketplace ID is required");
  }

  try {
    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (image !== undefined) updateData.image = image;
    if (discount !== undefined) updateData.discount = discount;
    if (discountCode !== undefined) updateData.discountCode = discountCode;
    if (link !== undefined) updateData.link = link;
    if (isActive !== undefined) updateData.isActive = isActive;

    const marketplace = await Marketplace.findByIdAndUpdate(
      marketplaceId,
      updateData,
      { new: true }
    ).lean();

    if (!marketplace) {
      return errorResponse(res, 404, "Marketplace offer not found");
    }

    // Format response according to node-api-structure
    const responseData = {
      _id: marketplace._id,
      title: marketplace.title,
      description: marketplace.description,
      image: marketplace.image,
      discount: marketplace.discount,
      discountCode: marketplace.discountCode,
      link: marketplace.link,
      isActive: marketplace.isActive,
      createdAt: marketplace.createdAt
    };

    return successResponse(
      res,
      200,
      "Marketplace offer updated successfully",
      responseData,
      'marketplaceOffer'
    );
  } catch (error) {
    return errorResponse(res, 500, "Failed to update marketplace offer", error.message);
  }
};

/**
 * @description Delete Marketplaces
 * @route DELETE /api/marketplace/delete/:id
 * @access Private
 */
module.exports.deleteMarketplace = async (req, res) => {
  const { marketplaceId } = req.query;

  if (!marketplaceId) {
    return errorResponse(res, 400, "Marketplace ID is required");
  }

  try {
    const marketplace = await Marketplace.findByIdAndDelete(marketplaceId);

    if (!marketplace) {
      return errorResponse(res, 404, "Marketplace offer not found");
    }

    return successResponse(res, 200, "Marketplace offer deleted successfully");
  } catch (error) {
    return errorResponse(res, 500, "Failed to delete marketplace offer", error.message);
  }
};
