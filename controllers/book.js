//Models
const mongoose = require("mongoose");
const Book = require("../models/book");
const { successResponse, errorResponse } = require("../utils/apiResponse");
const socketManager = require("../utils/socketManager");

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

    // Broadcast new book release to all users
    await socketManager.broadcastNewBookRelease(book);

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
    const books = await Book.find({}, { isOpened: 0 }).sort({ createdAt: -1 }).lean();

    //Response
    return successResponse(res, 200, "Books retrieved successfully", books);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get books", error);
  }
};

module.exports.getContinueReading = async (req, res) => {
  try {
    const userId = req.userId;
    console.log('📚 [Continue Reading] Starting API call for user:', userId);
    
    // Input validation
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      console.error('❌ [Continue Reading] Invalid userId:', userId);
      return errorResponse(res, 401, "Authentication required");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    // Find books where user ID is in the isOpened array - optimized query
    const continueReadingBooks = await Book.find({
      isOpened: {
        $exists: true,
        $ne: [],
        $in: [userObjectId]
      }
    })
    .select('-isOpened') // Exclude sensitive field from response
    .sort({ updatedAt: -1 })
    .lean(); // Use lean for better performance

    console.log('📊 [Continue Reading] Found', continueReadingBooks.length, 'books for user');

    // Structure response following original API format
    const structuredBooks = continueReadingBooks.map(book => ({
      _id: book._id,
      title: book.title,
      author: book.author,
      image: book.image,
      content: book.content,
      createdAt: book.createdAt
    }));

    console.log('✅ [Continue Reading] Returning', structuredBooks.length, 'books');

    return successResponse(res, 200, "Continue reading books retrieved successfully", structuredBooks, "continueReading");
  } catch (error) {
    console.error('❌ [Continue Reading] Error:', error.message);
    
    // Enhanced error handling
    if (error.name === 'CastError') {
      return errorResponse(res, 400, "Invalid data format", error.message);
    }
    return errorResponse(res, 500, "Failed to get continue reading books", error.message);
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
