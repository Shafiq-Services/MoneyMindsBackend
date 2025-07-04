const mongoose = require("mongoose");

const feedSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      default: "",
    },
    image: {
      type: String,
      default: "",
    },
    likes: { type: Array, ref: "User" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Feed", feedSchema);
