const mongoose = require('mongoose');

const userNotificationReadSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  notificationId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Notification', 
    required: true 
  },
  readAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Compound index to ensure one read record per user per notification
userNotificationReadSchema.index({ userId: 1, notificationId: 1 }, { unique: true });

// Index for efficient queries
userNotificationReadSchema.index({ userId: 1, readAt: -1 });

module.exports = mongoose.model('UserNotificationRead', userNotificationReadSchema); 