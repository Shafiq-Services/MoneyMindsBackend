const mongoose = require('mongoose');

const chatCategorySchema = new mongoose.Schema({
  slug: {
    type: String,
    unique: true,
    required: true,
    default: 'GENERAL',
    uppercase: true,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ChatCategory', chatCategorySchema);
