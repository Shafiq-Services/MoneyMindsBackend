const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    author: {
      type: String,
      required: true,
    },
    image: {
      type: String,
      required: true,
    },
    chapters: [
      {
        number: { type: Number, required: true },
        pages: { type: String, default: "" },
        description: { type: String, default: "" },
        content: { type: String, required: true },
      },
    ],
    isOpened: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Book", bookSchema);
