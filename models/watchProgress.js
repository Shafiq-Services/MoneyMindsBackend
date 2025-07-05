const mongoose = require('mongoose');

const watchProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  videoId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Video',
    required: true
  },
  seconds: {
    type: Number,
    default: 0,
    min: 0
  },
  percentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  totalDuration: {
    type: Number,
    default: 0,
    min: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to ensure one progress record per user per video
watchProgressSchema.index({ userId: 1, videoId: 1 }, { unique: true });

// Index for efficient queries
watchProgressSchema.index({ userId: 1, lastUpdated: -1 });
watchProgressSchema.index({ videoId: 1 });

module.exports = mongoose.model('WatchProgress', watchProgressSchema); 