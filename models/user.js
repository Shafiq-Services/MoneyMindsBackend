const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  firstName: String,
  lastName: String,
  phone: String,
  username: { type: String, unique: true, sparse: true },
  avatar: { type: String },
});

module.exports = mongoose.model('User', userSchema);
