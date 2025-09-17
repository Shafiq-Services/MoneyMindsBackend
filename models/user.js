const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  firstName: String,
  lastName: String,
  phone: String,
  username: { type: String, unique: true, sparse: true },
  avatar: { type: String },
  bio: { type: String, default: '' },
  country: { type: String, default: '' },
  stripeCustomerId: { type: String },
  role: { type: String, enum: ['user', 'admin', 'moderator'], default: 'user' },
  status: { 
    type: String, 
    enum: ['active', 'inactive', 'banned', 'waitlist', 'card_declined'], 
    default: 'active' 
  },
  isActive: { type: Boolean, default: true }, // Keep for backward compatibility
  password: { type: String }, // Only used for admin accounts
  plan: { type: String, enum: ['monthly', 'yearly'], default: 'monthly' },
  lastLoginAt: { type: Date },
  emailVerified: { type: Boolean, default: false },
  profileCompleted: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
