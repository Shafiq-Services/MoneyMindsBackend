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
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
