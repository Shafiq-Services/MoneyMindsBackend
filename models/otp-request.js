const mongoose = require('mongoose');

const otpRequestSchema = new mongoose.Schema({
    email: { type: String, required: true },
    code: { type: String, required: true },
    requestedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true }
  }, { timestamps: true });
  
  otpRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  
module.exports = mongoose.model('OTPRequest', otpRequestSchema);