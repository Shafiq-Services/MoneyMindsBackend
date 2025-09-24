const router = require("express").Router();
const { authMiddleware, adminAuthMiddleware } = require("../middlewares/auth");

//Controllers
const {
  createBook,
  getBooks,
  editBook,
  deleteBook,
  getContinueReading,
} = require("../controllers/book");

// Public book viewing routes
router.get("/get", authMiddleware, getBooks);
router.get("/continue-reading", authMiddleware, getContinueReading);

// Admin-only book management routes
router.post("/create", adminAuthMiddleware, createBook);
router.put("/edit/:id", adminAuthMiddleware, editBook);
router.delete("/delete/:id", adminAuthMiddleware, deleteBook);

module.exports = router;
