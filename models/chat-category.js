const mongoose = require('mongoose');

const chatCategorySchema = new mongoose.Schema({
    name: String,
    type: { type: String, enum: ['GROUP', 'CHANNEL'], required: true },
    slug: { type: String, unique: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdAt: { type: Date, default: Date.now }
  });
  
module.exports = mongoose.model('ChatCategory', chatCategorySchema);