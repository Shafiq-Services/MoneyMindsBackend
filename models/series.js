const mongoose = require('mongoose');

const seriesSchema = new mongoose.Schema({
    title: String,
    description: String,
    posterUrl: String,
    createdAt: { type: Date, default: Date.now }
  });
  
module.exports = mongoose.model('Series', seriesSchema);