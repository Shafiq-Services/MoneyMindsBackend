const mongoose = require('mongoose');
const slugify = require('slugify');

const channelSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  slug: { type: String, unique: true, lowercase: true, trim: true },
  campusId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campus', required: false },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'ChatCategory' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isPlatformChannel: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

channelSchema.pre('validate', function (next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { lower: true, strict: true });
  }
  next();
});

module.exports = mongoose.model('Channel', channelSchema);
