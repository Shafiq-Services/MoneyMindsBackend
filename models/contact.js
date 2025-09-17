const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    required: true 
  },
  firstName: { 
    type: String, 
    required: true 
  },
  lastName: { 
    type: String, 
    required: true 
  },
  description: {
    type: String,
    required: true
  },
  fileUrl: { 
    type: String 
  },
  message: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['unread', 'viewed', 'responded'],
    default: 'unread'
  },
  adminReply: {
    type: String,
    default: ''
  },
  readAt: {
    type: Date
  },
  respondedAt: {
    type: Date
  },
  respondedByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema); 