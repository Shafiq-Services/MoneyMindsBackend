const mongoose = require('mongoose');

const emailSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true
  },
  content: {
    type: String,
    required: true
  },
  htmlContent: {
    type: String,
    default: ''
  },
  sentByAdminId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipients: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    email: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['sent', 'delivered', 'bounced', 'failed'],
      default: 'sent'
    },
    sentAt: {
      type: Date,
      default: Date.now
    },
    deliveredAt: {
      type: Date
    },
    openedAt: {
      type: Date
    },
    isOpened: {
      type: Boolean,
      default: false
    }
  }],
  totalRecipients: {
    type: Number,
    default: 0
  },
  totalSent: {
    type: Number,
    default: 0
  },
  totalDelivered: {
    type: Number,
    default: 0
  },
  totalOpened: {
    type: Number,
    default: 0
  },
  totalBounced: {
    type: Number,
    default: 0
  },
  totalFailed: {
    type: Number,
    default: 0
  },
  openRate: {
    type: Number,
    default: 0
  },
  deliveryRate: {
    type: Number,
    default: 0
  },
  campaignType: {
    type: String,
    enum: ['broadcast', 'targeted', 'automated'],
    default: 'broadcast'
  },
  status: {
    type: String,
    enum: ['draft', 'sending', 'sent', 'failed'],
    default: 'draft'
  },
  scheduledAt: {
    type: Date
  },
  sentAt: {
    type: Date
  },
  completedAt: {
    type: Date
  }
}, { timestamps: true });

// Indexes for efficient queries
emailSchema.index({ sentByAdminId: 1, createdAt: -1 });
emailSchema.index({ 'recipients.userId': 1 });
emailSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Email', emailSchema);
