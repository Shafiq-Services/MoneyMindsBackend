const router = require("express").Router();
const { authMiddleware, adminAuthMiddleware } = require("../middlewares/auth");

//Controllers
const {
  createBanner,
  getBanners,
  getActiveBanner,
  editBanner,
  toggleBannerActive,
  deleteBanner,
} = require("../controllers/banner");

// Public banner viewing routes
router.get("/active", getActiveBanner);

// Admin-only banner management routes
router.post("/create", adminAuthMiddleware, createBanner);
router.get("/get", adminAuthMiddleware, getBanners);
router.put("/edit", adminAuthMiddleware, editBanner);
router.put("/activate", adminAuthMiddleware, toggleBannerActive);
router.delete("/delete", adminAuthMiddleware, deleteBanner);

module.exports = router;
