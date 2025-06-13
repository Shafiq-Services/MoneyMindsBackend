const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { ProgressTracker } = require('../utils/progressTracker');
const socketManager = require('../utils/socketManager');
const Video = require('../models/video');

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large files
  },
  fileFilter: (req, file, cb) => {
    if (req.path.includes('/image')) {
      // Image upload validation
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
      }
    } else if (req.path.includes('/video')) {
      // Video upload validation
      const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
      if (allowedVideoTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only video files (MP4, AVI, MOV, WMV, FLV, WebM, MKV) are allowed'), false);
      }
    } else {
      cb(new Error('Invalid upload endpoint'), false);
    }
  }
});

const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: false, message: 'No image file provided' });
    }

    const imageId = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const fileName = `images/${imageId}${fileExtension}`;

    // Create progress tracker for image
    const progressTracker = new ProgressTracker(imageId, 'image', socketManager);
    
    try {
      // Real upload progress - track actual upload to B2
      progressTracker.updateUploadProgress(0);
      
      const uploadResult = await uploadFile(fileName, req.file.buffer, (progressData) => {
        // Real upload progress callback from B2 upload
        if (progressData && progressData.percent) {
          progressTracker.updateUploadProgress(progressData.percent);
        }
      });
      
      progressTracker.updateUploadProgress(100);
      
      const result = {
        imageUrl: uploadResult.fileUrl,
      };
      
      progressTracker.complete(result);

      return res.status(200).json({
        status: true,
        message: 'Image uploaded successfully',
        imageId: imageId,
        ...result,
      });

    } catch (error) {
      progressTracker.fail(error);
      throw error;
    }

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Failed to upload image',
      error: err.message,
    });
  }
};

const uploadVideo = async (req, res) => {
  const videoId = uuidv4();
  const progressTracker = new ProgressTracker(videoId, 'video', socketManager);

  try {
    if (!req.file) {
      progressTracker.fail(new Error('No video file provided'));
      return res.status(400).json({ status: false, message: 'No video file provided' });
    }

    // Store original video file
    const fileExtension = path.extname(req.file.originalname);
    const originalFileName = `videos/${videoId}/original${fileExtension}`;
    
    // Upload original video file
    console.log('📤 Starting original video upload...');
    progressTracker.updateUploadProgress(0);
    const originalUploadResult = await uploadFile(originalFileName, req.file.buffer, (progressData) => {
      if (progressData && progressData.percent) {
        console.log(`📤 Upload Progress: ${progressData.percent}%`);
        progressTracker.updateUploadProgress(progressData.percent);
      }
    });
    progressTracker.updateUploadProgress(100);
    console.log('✅ Original video upload complete');

    // Create video document with original URL
    const video = await Video.create({
      videoUrl: originalUploadResult.fileUrl, // Temporary URL until transcoding is done
      originalVideoUrl: originalUploadResult.fileUrl,
      type: 'film', // Default type, can be updated later
    });

    // Start transcoding
    try {
      console.log('🔄 Starting video transcoding...');
      const transcodeResult = await transcodeToHLS(req.file.buffer, videoId, progressTracker);
      console.log('✅ Video transcoding complete');
      
      // Update video document with transcoded URL and resolutions
      await Video.findByIdAndUpdate(video._id, {
        videoUrl: transcodeResult.videoUrl,
        resolutions: transcodeResult.resolutions
      });
      
      // Complete the progress tracking
      progressTracker.complete({
        videoUrl: transcodeResult.videoUrl,
        originalVideoUrl: originalUploadResult.fileUrl,
        resolutions: transcodeResult.resolutions,
        videoId: video._id
      });

      // Return complete result after everything is done
      return res.status(200).json({
        status: true,
        message: 'Video uploaded and processed successfully',
        videoId: video._id,
        video: {
          id: video._id,
          videoUrl: transcodeResult.videoUrl,
          originalVideoUrl: originalUploadResult.fileUrl,
          resolutions: transcodeResult.resolutions
        }
      });
      
    } catch (transcodeError) {
      console.error('❌ Transcoding failed:', transcodeError.message);
      progressTracker.fail(transcodeError);
      return res.status(500).json({
        status: false,
        message: 'Failed to process video',
        error: transcodeError.message
      });
    }
    
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
    progressTracker.fail(err);
    return res.status(500).json({
      status: false,
      message: 'Failed to upload video',
      error: err.message
    });
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
}; 