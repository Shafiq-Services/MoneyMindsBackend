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
  const { title, author, image, chapters } = req.body;

  //Error handling
  if (!title || !author || !image || chapters.length === 0) {
    return res.status(400).json({ message: "All fields are required" });
  }

  try {
    const book = await Book.create({
      title,
      author,
      image,
      chapters,
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
    const books = await Book.find({}, { isOpened: 0 })
      .sort({ createdAt: -1 })
      .lean();

    //Response
    return successResponse(res, 200, "Books retrieved successfully", books);
  } catch (error) {
    return errorResponse(res, 500, "Failed to get books", error);
  }
};

module.exports.getContinueReading = async (req, res) => {
  try {
    const userId = req.userId;
    console.log("📚 [Continue Reading] Starting API call for user:", userId);
    console.log("📚 [Continue Reading] User ID type:", typeof userId);

    // Safety check for userId
    if (!userId) {
      console.error("❌ [Continue Reading] No userId found in request");
      return errorResponse(res, 401, "Authentication required");
    }

    // First, let's check what books exist with isOpened arrays
    const allBooksWithOpened = await Book.find({
      isOpened: { $exists: true, $ne: [] },
    }).lean();
    console.log(
      "📊 [Continue Reading] Total books with isOpened arrays:",
      allBooksWithOpened.length
    );

    allBooksWithOpened.forEach((book) => {
      console.log(
        `📖 [Continue Reading] Book "${book.title}" has isOpened:`,
        book.isOpened.map((id) => id.toString())
      );
      console.log(
        `📖 [Continue Reading] Does it contain user ${userId}?`,
        book.isOpened.some((id) => id.toString() === userId.toString())
      );
    });

    // Find books where:
    // 1. isOpened array exists and is not empty
    // 2. Current user ID is in the isOpened array
    console.log("🔍 [Continue Reading] Searching with query:", {
      isOpened: {
        $exists: true,
        $ne: [],
        $in: [userId],
      },
    });

    const continueReadingBooks = await Book.find(
      {
        isOpened: {
          $exists: true,
          $ne: [],
          $in: [new mongoose.Types.ObjectId(userId)], // Convert to ObjectId for proper matching
        },
      },
      { isOpened: 0 } // Exclude isOpened field from response
    )
      .sort({ updatedAt: -1 })
      .lean(); // Sort by recently opened (updatedAt when isOpened array is modified)

    console.log(
      "📊 [Continue Reading] Found",
      continueReadingBooks.length,
      "books for user"
    );
    console.log(
      "📋 [Continue Reading] Book titles:",
      continueReadingBooks.map((book) => book.title)
    );

    // Structure response following API conventions
    const structuredBooks = continueReadingBooks.map((book) => ({
      _id: book._id,
      title: book.title,
      author: book.author,
      image: book.image,
      chapters: book.chapters,
      createdAt: book.createdAt,
    }));

    console.log(
      "✅ [Continue Reading] Returning",
      structuredBooks.length,
      "books"
    );

    return successResponse(
      res,
      200,
      "Continue reading books retrieved successfully",
      structuredBooks,
      "continueReading"
    );
  } catch (error) {
    console.error("❌ [Continue Reading] Error:", error.message);
    return errorResponse(
      res,
      500,
      "Failed to get continue reading books",
      error.message
    );
  }
};

/**
 * @description Edit Book
 * @route PUT /api/book/edit/:id
 * @access Public
 */
module.exports.editBook = async (req, res) => {
  const { id } = req.params;
  const { title, author, image, chapters } = req.body;

  try {
    const book = await Book.findByIdAndUpdate(id, {
      title,
      author,
      image,
      chapters,
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
