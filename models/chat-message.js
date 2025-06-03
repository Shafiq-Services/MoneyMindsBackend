const mongoose = require('mongoose');

const chatMessageSchema = new mongoose.Schema({
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatCategory', required: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    content: String,
    attachments: [{
      fileUrl: String,
      fileName: String
    }],
    reactions: [{
      emoji: String,
      userIds: [{ type: mongoose.Schema.Types.ObjectId }]
    }],
    createdAt: { type: Date, default: Date.now }
  });
  
module.exports = mongoose.model('ChatMessage', chatMessageSchema);