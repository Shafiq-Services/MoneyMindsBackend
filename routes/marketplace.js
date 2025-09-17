const router = require("express").Router();
const { authMiddleware, adminAuthMiddleware } = require("../middlewares/auth");

//Controllers
const {
  createMarketplace,
  getMarketplaces,
  editMarketplace,
  deleteMarketplace,
} = require("../controllers/marketplace");

// Public marketplace viewing route
router.get("/get", authMiddleware, getMarketplaces);

// Admin-only marketplace management routes
router.post("/add", adminAuthMiddleware, createMarketplace);
router.put("/edit", adminAuthMiddleware, editMarketplace);
router.delete("/delete", adminAuthMiddleware, deleteMarketplace);

module.exports = router;
