const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  // Recipient information (optional for broadcasts)
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  // Broadcast information
  isBroadcastToAll: { type: Boolean, default: false },
  
  // Notification content
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['success', 'warning', 'error', 'info'], 
    default: 'info' 
  },
  icon: { type: String, default: '📢' },
  
  // Notification category/source
  category: {
    type: String,
    enum: [
      'campus-release',
      'film-release', 
      'series-release',
      'book-release',
      'course-release',
      'lesson-release',
      'subscription-warning',
      'admin-broadcast',
      'general'
    ],
    default: 'general'
  },
  
  // Related entity information
  relatedEntityId: { type: mongoose.Schema.Types.ObjectId },
  relatedEntityType: { 
    type: String,
    enum: ['campus', 'film', 'series', 'book', 'course', 'lesson', 'subscription']
  },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus' },
  
  // Admin notification fields
  isAdminSent: { type: Boolean, default: false },
  sentByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  totalRecipients: { type: Number }, // For broadcast notifications
  
  // Status tracking (not used for broadcast notifications)
  isRead: { type: Boolean, default: false },
  readAt: { type: Date },
  
  // Event metadata
  eventName: { type: String },
  data: { type: mongoose.Schema.Types.Mixed },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient queries
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ category: 1, createdAt: -1 });
notificationSchema.index({ isAdminSent: 1, sentByAdminId: 1, createdAt: -1 });
notificationSchema.index({ isBroadcastToAll: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema); 