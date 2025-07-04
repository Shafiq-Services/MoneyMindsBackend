//Models
const Book = require("../models/book");
const { successResponse, errorResponse } = require("../utils/apiResponse");

/**
 * @description Create Book
 * @route POST /api/book/create
 * @access Public
 */
module.exports.createBook = async (req, res) => {
  const { title, author, image, content } = req.body;

  //Error handling
  if (!title || !author || !image || !content) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const book = await Book.create({
      title,
      author,
      image,
      content,
    });

    //Response
    return successResponse(res, 201, "Book created successfully", book);
  } catch (error) {
    return errorResponse(res, 500, "Failed to create book", error);
  }
};

/**
 * @description Get Books
 * @route GET /api/book/get
 * @access Public
 */
module.exports.getBooks = async (req, res) => {
  try {
    const books = await Book.find({}).sort({ createdAt: -1 }).lean();

    //Response
    return successResponse(res, 200, "Books retrieved successfully", books);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get books", error);
  }
};

/**
 * @description Edit Book
 * @route PUT /api/book/edit/:id
 * @access Public
 */
module.exports.editBook = async (req, res) => {
  const { id } = req.params;
  const { title, author, image, content } = req.body;

  try {
    const book = await Book.findByIdAndUpdate(id, {
      title,
      author,
      image,
      content,
    });

    if (!book) {
      return errorResponse(res, 404, "Book not found");
    }

    //Response
    return successResponse(res, 200, "Book updated successfully", book);
  } catch (error) {
    return errorResponse(res, 500, "Failed to edit book", error);
  }
};

/**
 * @description Delete Book
 * @route DELETE /api/book/delete/:id
 * @access Public
 */
module.exports.deleteBook = async (req, res) => {
  const { id } = req.params;

  try {
    const book = await Book.findByIdAndDelete(id);

    if (!book) {
      return errorResponse(res, 404, "Book not found");
    }

    //Response
    return successResponse(res, 200, "Book deleted successfully");
  } catch (error) {
    return errorResponse(res, 500, "Failed to delete book", error);
  }
};
