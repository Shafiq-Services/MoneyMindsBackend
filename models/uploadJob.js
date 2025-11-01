const mongoose = require('mongoose');

const uploadJobSchema = new mongoose.Schema({
  uploadId: { 
    type: String, 
    required: true, 
    unique: true, 
    index: true 
  },
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true,
    index: true
  },
  uploadType: { 
    type: String, 
    enum: ['video', 'image', 'file'], 
    required: true 
  },
  type: { 
    type: String, // film, episode, lesson for videos; campus, course, etc. for images
    required: false 
  },
  status: {
    type: String,
    enum: ['queued', 'uploading', 'transcoding', 'completed', 'failed'],
    default: 'queued'
  },
  progress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  stage: {
    type: String,
    enum: ['queued', 'uploading', 'transcoding', 'complete', 'error'],
    default: 'queued'
  },
  message: {
    type: String,
    default: 'Upload queued'
  },
  // File information
  originalFileName: String,
  fileSize: Number,
  mimeType: String,
  tempFilePath: String,
  
  // Result data (populated after completion)
  result: {
    videoUrl: String,
    originalVideoUrl: String,
    imageUrl: String,
    fileUrl: String,
    resolutions: [Number],
    duration: Number
  },
  
  // Error information
  error: {
    message: String,
    stack: String,
    timestamp: Date
  },
  
  // Processing metadata
  startedAt: Date,
  completedAt: Date,
  
  // Additional progress details
  uploadSpeed: String,
  uploadedBytes: Number,
  
  createdAt: { 
    type: Date, 
    default: Date.now,
    index: true
  }
});

// Index for efficient queries
uploadJobSchema.index({ userId: 1, createdAt: -1 });
uploadJobSchema.index({ uploadId: 1, userId: 1 });

module.exports = mongoose.model('UploadJob', uploadJobSchema);



