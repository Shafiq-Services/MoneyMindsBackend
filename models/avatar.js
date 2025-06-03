const mongoose = require('mongoose');

const avatarSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true },
  addedByAdmin: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Avatar', avatarSchema);