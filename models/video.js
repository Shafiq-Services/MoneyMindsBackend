const mongoose = require('mongoose');

const videoSchema = new mongoose.Schema({
    title: String,
    description: String,
    type: { type: String, enum: ['film', 'episode'], required: true },
    seriesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Series' },
    seasonNumber: Number,
    episodeNumber: Number,
    videoUrl: String,
    originalVideoUrl: String,
    resolutions: [String],
    posterUrl: String,
    createdAt: { type: Date, default: Date.now }
  });
  
module.exports = mongoose.model('Video', videoSchema);