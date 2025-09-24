const mongoose = require("mongoose");

const marketplaceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: '',
    },
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
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Marketplace", marketplaceSchema);
