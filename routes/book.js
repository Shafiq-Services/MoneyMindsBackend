const router = require("express").Router();

//Controllers
const {
  createBook,
  getBooks,
  editBook,
  deleteBook,
} = require("../controllers/book");

//Routes
router.post("/create", createBook);
router.get("/get", getBooks);
router.put("/edit/:id", editBook);
router.delete("/delete/:id", deleteBook);

module.exports = router;
