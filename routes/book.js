const router = require("express").Router();
const authMiddleware = require("../middlewares/auth");

//Controllers
const {
  createBook,
  getBooks,
  editBook,
  deleteBook,
  getContinueReading,
} = require("../controllers/book");

//Routes
router.post("/create", createBook);
router.get("/get", getBooks);
router.get("/continue-reading", authMiddleware, getContinueReading); // Protected route
router.put("/edit/:id", editBook);
router.delete("/delete/:id", deleteBook);

module.exports = router;
