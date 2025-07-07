const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { uploadFileWithRetry } = require('../utils/chunkedUpload');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const fs = require('fs');

// Configure multer for disk storage to handle large files efficiently
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../temp/uploads');
    // Ensure directory exists
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1E9)}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 * 1024, // 10GB limit for large files
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
    } else if (req.path.includes('/file')) {
      // Allow any file type for /file endpoint
      cb(null, true);
    } else {
      cb(new Error('Invalid upload endpoint'), false);
    }
  }
});

// Helper function to get the folder path based on image type
const getImageFolder = (type) => {
  const folderMap = {
    'campus': 'images/campuses',
    'course': 'images/courses', 
    'video': 'images/videos',
    'series': 'images/series',
    'book': 'images/books',
    'user': 'images/users',
    'avatar': 'images/avatars',
    'banner': 'images/banners',
    'marketplace': 'images/marketplace',
    'feed': 'images/feeds',
    'chat': 'images/chat',
    'contact': 'files/contact'
  };
  
  return folderMap[type] || 'images'; // Default to 'images' if type not found
};

// Helper function to validate image type
const validateImageType = (type) => {
  const validTypes = [
    'campus', 'course', 'video', 'series', 'book', 
    'user', 'avatar', 'banner', 'marketplace', 'feed', 'chat', 'contact'
  ];
  
  return validTypes.includes(type);
};

// Helper function to clean up temporary files
const cleanupTempFile = (filePath) => {
  if (filePath && fs.existsSync(filePath)) {
    fs.unlink(filePath, (err) => {
      if (err) {
        console.error('Failed to cleanup temp file:', err);
      } else {
        console.log('✅ Temp file cleaned up:', filePath);
      }
    });
  }
};

const uploadImage = async (req, res) => {
  try {
    console.log('🖼️ Starting image upload process...');
    
    // Get and validate the type query parameter
    const { type } = req.query;
    
    if (!type) {
      return errorResponse(res, 400, 'Image type is required. Use query parameter: ?type=campus|course|video|series|book|user|avatar|banner|marketplace|feed|chat');
    }
    
    if (!validateImageType(type)) {
      return errorResponse(res, 400, 'Invalid image type. Valid types: campus, course, video, series, book, user, avatar, banner, marketplace, feed, chat');
    }
    
    console.log('📁 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      userId: req.userId,
      imageType: type
    });

    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Validate file size (10MB limit for images)
    if (req.file.size > 10 * 1024 * 1024) {
      // Clean up temp file
      cleanupTempFile(req.file.path);
      return errorResponse(res, 400, 'File size exceeds 10MB limit');
    }

    // Validate file type
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedImageTypes.includes(req.file.mimetype)) {
      // Clean up temp file
      cleanupTempFile(req.file.path);
      return errorResponse(res, 400, 'Invalid image file type');
    }

    const imageId = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const folderPath = getImageFolder(type);
    const fileName = `${folderPath}/${imageId}${fileExtension}`;

    try {
      // Send upload start event
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType: 'image',
        uploadId: imageId,
        imageType: type,
        stage: 'uploading',
        progress: 0,
        message: 'Starting image upload...'
      });
      
      const uploadResult = await uploadFile(fileName, fs.readFileSync(req.file.path));
      
      // Send upload complete event
      socketManager.broadcastUploadComplete(req.userId, {
        uploadType: 'image',
        uploadId: imageId,
        imageType: type,
        imageUrl: uploadResult.fileUrl,
        createdAt: new Date()
      });
      
      // Structure response according to node-api-structure
      const responseData = {
        _id: imageId,
        imageUrl: uploadResult.fileUrl,
        imageType: type,
        createdAt: new Date()
      };

      // Clean up temp file
      cleanupTempFile(req.file.path);

      return successResponse(res, 201, 'Image uploaded successfully', responseData, 'image');

    } catch (error) {
      // Send error event
      socketManager.broadcastUploadError(req.userId, {
        uploadType: 'image',
        uploadId: imageId,
        imageType: type,
        error: error.message,
        stage: 'upload'
      });
      
      // Clean up temp file on error
      cleanupTempFile(req.file.path);
      throw error;
    }

  } catch (err) {
    return errorResponse(res, 500, 'Failed to upload image', err.message);
  }
};

// Helper function to get video folder based on type
const getVideoFolder = (videoType) => {
  const videoFolders = {
    'film': 'videos/films',
    'episode': 'videos/episodes', 
    'lesson': 'videos/lessons'
  };
  return videoFolders[videoType] || 'videos/films';
};

// Helper function to validate video type
const validateVideoType = (videoType) => {
  const validTypes = ['film', 'episode', 'lesson'];
  return validTypes.includes(videoType);
};

const uploadVideo = async (req, res) => {
  let videoId = null;
  let videoType = null;
  
  try {
    console.log('🎬 Starting video upload to storage...');
    
    // Check for video type in query parameter
    videoType = req.query.type;
    if (!videoType) {
      return errorResponse(res, 400, 'Video type is required. Use query parameter: ?type=film|episode|lesson');
    }
    
    if (!validateVideoType(videoType)) {
      return errorResponse(res, 400, 'Invalid video type. Valid types: film, episode, lesson');
    }

    // File validation
    if (!req.file) {
      return errorResponse(res, 400, 'No video file provided');
    }

    if (req.file.size > 10 * 1024 * 1024 * 1024) { // 10GB limit
      return errorResponse(res, 400, 'Video file too large. Maximum size is 10GB');
    }

    // Validate video file type
    const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
    if (!allowedVideoTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, 'Invalid video file type');
    }

    videoId = uuidv4();
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Store original video file with organized folder structure
    const videoFolder = getVideoFolder(videoType);
    const originalFileName = `${videoFolder}/${videoId}/original${fileExtension}`;

    // Upload original video file using chunked upload with progress tracking
    console.log('📤 Starting original video upload with chunks...');
    
    // Send upload start event
    socketManager.broadcastUploadProgress(req.userId, {
      uploadType: 'video',
      uploadId: videoId,
      videoType,
      stage: 'uploading',
      progress: 0,
      message: 'Starting video upload...'
    });
    
    const originalUploadResult = await uploadFileWithRetry(
      req.file.path, 
      originalFileName,
      3, // maxRetries
      (progressData) => {
        // Progress callback for chunked upload
        socketManager.broadcastUploadProgress(req.userId, {
          uploadType: 'video',
          uploadId: videoId,
          videoType,
          stage: 'uploading',
          progress: progressData.progress,
          message: progressData.message,
          completedChunks: progressData.completedChunks,
          totalChunks: progressData.totalChunks,
          currentChunk: progressData.currentChunk,
          fileSize: progressData.fileSize,
          uploadedBytes: progressData.uploadedBytes,
          uploadSpeed: progressData.uploadSpeed,
          timeRemaining: progressData.timeRemaining
        });
      }
    );
    
    console.log('✅ Original video upload complete');
    
    // Send upload complete event
    socketManager.broadcastUploadProgress(req.userId, {
      uploadType: 'video',
      uploadId: videoId,
      videoType,
      stage: 'uploading',
      progress: 100,
      message: 'Video upload complete, starting transcoding...'
    });

    // Transcode video to HLS with organized folder structure
    try {
      console.log('🔄 Starting video transcoding...');
      
      // Send transcoding start event
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType: 'video',
        uploadId: videoId,
        videoType,
        stage: 'transcoding',
        progress: 0,
        message: 'Starting video transcoding...'
      });
      
      // Read file from disk for transcoding
      const videoBuffer = fs.readFileSync(req.file.path);
      const transcodeResult = await transcodeToHLS(videoBuffer, videoId, videoType);
      console.log('✅ Video transcoding complete');
      
      // Send transcoding complete event
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType: 'video',
        uploadId: videoId,
        videoType,
        stage: 'transcoding',
        progress: 100,
        message: 'Video transcoding complete!'
      });

      // Response data
      const responseData = {
        _id: videoId,
        videoUrl: transcodeResult.videoUrl,
        originalVideoUrl: originalUploadResult.fileUrl,
        videoType: videoType,
        createdAt: new Date()
      };

      // Clean up temp file after successful upload
      cleanupTempFile(req.file.path);
      
      // Send final completion event
      socketManager.broadcastUploadComplete(req.userId, {
        uploadType: 'video',
        uploadId: videoId,
        videoType,
        videoUrl: transcodeResult.videoUrl,
        originalVideoUrl: originalUploadResult.fileUrl,
        resolutions: transcodeResult.resolutions,
        duration: transcodeResult.duration,
        createdAt: new Date()
      });
      
      return successResponse(res, 201, 'Video uploaded and processed successfully', responseData, 'video');

    } catch (transcodeError) {
      console.error('❌ Video transcoding failed:', transcodeError);
      
      // Send error event
      socketManager.broadcastUploadError(req.userId, {
        uploadType: 'video',
        uploadId: videoId,
        videoType,
        error: transcodeError.message,
        stage: 'transcoding'
      });
      
      // Clean up temp file
      cleanupTempFile(req.file.path);
      return errorResponse(res, 500, 'Failed to process video', transcodeError.message);
    }

  } catch (err) {
    console.error('❌ Video upload failed:', err);
    
    // Send error event
    socketManager.broadcastUploadError(req.userId, {
      uploadType: 'video',
      uploadId: videoId || 'unknown',
      videoType: videoType || 'unknown',
      error: err.message,
      stage: 'upload'
    });
    
    // Clean up temp file
    cleanupTempFile(req.file.path);
    return errorResponse(res, 500, 'Failed to upload video', err.message);
  }
};

const uploadGeneralFile = async (req, res) => {
  try {
    console.log('📎 Starting file upload process...');
    
    // Get and validate the type query parameter
    const { type } = req.query;
    
    if (!type) {
      return errorResponse(res, 400, 'File type is required. Use query parameter: ?type=contact|document|other');
    }
    
    console.log('📁 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    if (!req.file) {
      return errorResponse(res, 400, 'No file provided');
    }

    // Validate file size (1GB limit for files)
    if (req.file.size > 1 * 1024 * 1024 * 1024) {
      // Clean up temp file
      cleanupTempFile(req.file.path);
      return errorResponse(res, 400, 'File size exceeds 1GB limit');
    }

    // Accept any file type - no restrictions
    console.log('📄 File type:', req.file.mimetype);

    const fileId = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const folderPath = `files/${type}`;
    const fileName = `${folderPath}/${fileId}${fileExtension}`;

    try {
      // Send upload start event
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType: 'file',
        uploadId: fileId,
        fileType: req.file.mimetype,
        fileName: req.file.originalname,
        stage: 'uploading',
        progress: 0,
        message: 'Starting file upload...'
      });
      
      // Use chunked upload with progress tracking for large files
      const uploadResult = await uploadFileWithRetry(
        req.file.path,
        fileName,
        3, // maxRetries
        (progressData) => {
          // Progress callback for chunked upload
          socketManager.broadcastUploadProgress(req.userId, {
            uploadType: 'file',
            uploadId: fileId,
            fileType: req.file.mimetype,
            fileName: req.file.originalname,
            stage: 'uploading',
            progress: progressData.progress,
            message: progressData.message,
            completedChunks: progressData.completedChunks,
            totalChunks: progressData.totalChunks,
            currentChunk: progressData.currentChunk,
            fileSize: progressData.fileSize,
            uploadedBytes: progressData.uploadedBytes,
            uploadSpeed: progressData.uploadSpeed,
            timeRemaining: progressData.timeRemaining
          });
        }
      );
      
      // Send upload complete event
      socketManager.broadcastUploadComplete(req.userId, {
        uploadType: 'file',
        uploadId: fileId,
        fileUrl: uploadResult.fileUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        folderPath: folderPath,
        createdAt: new Date()
      });
      
      // Structure response according to node-api-structure
      const responseData = {
        _id: fileId,
        fileUrl: uploadResult.fileUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        folderPath: folderPath,
        createdAt: new Date()
      };

      // Clean up temp file
      cleanupTempFile(req.file.path);

      return successResponse(res, 201, 'File uploaded successfully', responseData, 'file');

    } catch (error) {
      // Send error event
      socketManager.broadcastUploadError(req.userId, {
        uploadType: 'file',
        uploadId: fileId,
        fileName: req.file.originalname,
        error: error.message,
        stage: 'upload'
      });
      
      // Clean up temp file on error
      cleanupTempFile(req.file.path);
      throw error;
    }

  } catch (err) {
    return errorResponse(res, 500, 'Failed to upload file', err.message);
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
  uploadGeneralFile,
}; 