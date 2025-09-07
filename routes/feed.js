const router = require("express").Router();

//Controllers
const {
  createFeed,
  editFeed,
  deleteFeed,
  getAdminFeeds,
  getUserFeeds,
} = require("../controllers/feed");

//Middlewares
const { authMiddleware, adminAuthMiddleware } = require("../middlewares/auth");

//Routes - User feed management
router.post("/create", authMiddleware, createFeed);
router.put("/edit/:id", authMiddleware, editFeed);
router.delete("/delete/:id", authMiddleware, deleteFeed);
router.get("/user/get", authMiddleware, getUserFeeds);

// Admin-only feed management
router.get("/admin/get", adminAuthMiddleware, getAdminFeeds);

module.exports = router;
