const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { ProgressTracker, getProgress } = require('../utils/progressTracker');
const socketManager = require('../utils/socketManager');

// Configure multer for memory storage with progress tracking
const storage = multer.memoryStorage();

// Custom multer setup with progress tracking
const createProgressMulter = (progressTracker) => {
  return multer({
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
};

// Standard upload middleware for routes
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large files
  },
  fileFilter: (req, file, cb) => {
    if (req.path.includes('/image')) {
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
      }
    } else if (req.path.includes('/video')) {
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

    // Return immediately with progress ID for tracking
    res.status(202).json({
      status: true,
      message: 'Video upload initiated. Processing will complete shortly.',
      videoId: videoId,
      progressId: videoId,
      processingStatus: 'in_progress',
    });

    // Process video asynchronously with real progress tracking
    try {
      // Start with actual file size for real progress
      const fileSize = req.file.size;
      progressTracker.updateUploadProgress(0);
      
      // Since multer already loaded the file into memory, we consider upload "complete"
      // In a real streaming scenario, this would track actual bytes received
      progressTracker.updateUploadProgress(100);
      
      // Now start real transcoding with progress
      const transcodeResult = await transcodeToHLS(req.file.buffer, videoId, progressTracker);
      
      progressTracker.complete({
        videoUrl: transcodeResult.videoUrl,
        resolutions: transcodeResult.resolutions,
        duration: transcodeResult.duration,
        videoId: videoId,
        fileSize: fileSize
      });
      
      console.log(`Video ${videoId} processed successfully:`, transcodeResult);
      
    } catch (transcodeError) {
      console.error(`Video ${videoId} processing failed:`, transcodeError.message);
      progressTracker.fail(transcodeError);
    }

  } catch (err) {
    progressTracker.fail(err);
    return res.status(500).json({
      status: false,
      message: 'Failed to initiate video upload',
      error: err.message,
    });
  }
};

const getVideoStatus = async (req, res) => {
  try {
    const { videoId } = req.query;

    if (!videoId) {
      return res.status(400).json({ status: false, message: 'Video ID is required' });
    }

    // Get progress from tracker
    const progress = getProgress(videoId);
    
    if (!progress) {
      return res.status(404).json({ 
        status: false, 
        message: 'Video not found or processing has been completed and cleaned up' 
      });
    }

    return res.status(200).json({
      status: true,
      message: 'Video status retrieved',
      ...progress
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Failed to get video status',
      error: err.message,
    });
  }
};

const getUploadProgress = async (req, res) => {
  try {
    const { progressId } = req.params;

    if (!progressId) {
      return res.status(400).json({ status: false, message: 'Progress ID is required' });
    }

    const progress = getProgress(progressId);
    
    if (!progress) {
      return res.status(404).json({ 
        status: false, 
        message: 'Progress not found or upload has been completed and cleaned up' 
      });
    }

    return res.status(200).json({
      status: true,
      message: 'Progress retrieved successfully',
      progress: progress
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Failed to get upload progress',
      error: err.message,
    });
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
  getVideoStatus,
  getUploadProgress,
}; 