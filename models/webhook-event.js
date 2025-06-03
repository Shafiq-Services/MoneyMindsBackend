const mongoose = require('mongoose');

const webhookSchema = new mongoose.Schema({
    provider: { type: String, enum: ['stripe', 'paypal'] },
    eventType: String,
    rawData: mongoose.Schema.Types.Mixed,
    frontendSync: { type: Boolean, default: false },
    processed: { type: Boolean, default: false },
    receivedAt: { type: Date, default: Date.now }
  });
  
module.exports = mongoose.model('WebhookEvent', webhookSchema);