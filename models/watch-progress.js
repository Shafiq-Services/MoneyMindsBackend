const mongoose = require('mongoose');

const watchProgressSchema = new mongoose.Schema({
    userId: mongoose.Schema.Types.ObjectId,
    videoId: mongoose.Schema.Types.ObjectId,
    progress: Number,
    updatedAt: { type: Date, default: Date.now }
  });
  
module.exports = mongoose.model('WatchProgress', watchProgressSchema);