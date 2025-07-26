const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    imageUrl: {
      type: String,
      required: true,
    },
    title: {
      type: String,
      required: true,
    },
    subtitle: {
      type: String,
      required: false,
    },
    description: {
      type: String,
      required: false,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

// Index for efficient queries on active status
bannerSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model("Banner", bannerSchema);
