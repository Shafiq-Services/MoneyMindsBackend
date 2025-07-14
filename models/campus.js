const mongoose = require('mongoose');

const campusSchema = new mongoose.Schema({
  slug: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  imageUrl: { type: String, default: '' },
  mainIconUrl: { type: String, default: '' },
  campusIconUrl: { type: String, default: '' },
  isMoneyMindsCampus: { type: Boolean, default: false },
  members: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    joinedAt: { type: Date, default: Date.now }
  }],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Campus', campusSchema); 