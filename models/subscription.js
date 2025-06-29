const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: String, enum: ['monthly', 'yearly'], required: true },
    provider: { type: String, enum: ['stripe', 'paypal'], required: true },
    status: { 
      type: String, 
      enum: [
        'active', 
        'canceled', 
        'past_due', 
        'unpaid', 
        'incomplete', 
        'incomplete_expired', 
        'trialing', 
        'paused'
      ], 
      default: 'active' 
    },
    currentPeriodEnd: { type: Date, required: true },
    recurring: { type: Boolean, default: true },
    metadata: mongoose.Schema.Types.Mixed
  }, { timestamps: true });
  
module.exports = mongoose.model('Subscription', subscriptionSchema);