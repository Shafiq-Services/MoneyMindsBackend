const mongoose = require('mongoose');

const moduleSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  name: { type: String, required: true },
  thumbnail: { type: String, default: '' }, // Module thumbnail image URL
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Module', moduleSchema); 