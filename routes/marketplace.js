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
router.post("/create", adminAuthMiddleware, createMarketplace);
router.put("/edit/:id", adminAuthMiddleware, editMarketplace);
router.delete("/delete/:id", adminAuthMiddleware, deleteMarketplace);

module.exports = router;
