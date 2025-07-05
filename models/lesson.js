const mongoose = require('mongoose');

const lessonSchema = new mongoose.Schema({
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Module', required: true },
  name: { type: String, required: true },
  videoUrl: { type: String, required: true }, // .m3u8 video URL
  resolutions: [Number], // Available video resolutions (e.g., [1080, 720, 480, 360])
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Lesson', lessonSchema); 