const mongoose = require("mongoose");

const marketplaceSchema = new mongoose.Schema(
  {
    image: {
      type: String,
      required: true,
    },
    discount: {
      type: Number,
      required: true,
    },
    discountCode: {
      type: String,
      required: true,
    },
    link: {
      type: String,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Marketplace", marketplaceSchema);
