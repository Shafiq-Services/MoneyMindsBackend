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
const authMiddleware = require("../middlewares/auth");

//Routes
router.post("/create", createFeed);
router.put("/edit/:id", editFeed);
router.delete("/delete/:id", deleteFeed);
router.get("/admin/get", getAdminFeeds);
router.get("/user/get", authMiddleware, getUserFeeds);

module.exports = router;
