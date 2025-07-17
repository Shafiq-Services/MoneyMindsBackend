const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  name: { type: String, required: true },
  videoUrl: { type: String, default: '' }, // .m3u8 video URL - now optional
  text: { type: String, default: '' }, // Lesson text content for text-only lessons
  resolutions: [Number], // Available video resolutions (e.g., [1080, 720, 480, 360])
  notes: { type: String, default: '' }, // Lesson notes, defaults to empty string
  length: { type: Number, default: 0 }, // Video length in seconds
  createdAt: { type: Date, default: Date.now }
});

// Add validation to ensure at least videoUrl or text is provided
lessonSchema.pre('validate', function(next) {
  if (!this.videoUrl && !this.text) {
    return next(new Error('Either videoUrl or text must be provided for a lesson'));
  }
  next();
});

module.exports = mongoose.model('Lesson', lessonSchema); 