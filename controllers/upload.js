const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { uploadFileWithRetry, uploadFileOptimized, listUnfinishedUploads } = require('../utils/chunkedUpload');
const { generateDirectUploadUrl, generateMultipartUploadUrls, completeMultipartUpload } = require('../utils/b2DirectUpload');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const fs = require('fs');
const axios = require('axios');

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

/**
 * Enhanced smart upload function with optimized B2 large file handling
 * Automatically chooses the best upload method based on file size and B2 best practices
 * Supports 4K videos and files up to 5GB+ with resumable uploads
 */
const smartUpload = async (filePath, fileName, fileSize, progressCallback = null) => {
  try {
    console.log(`📤 Smart upload starting for: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    
    // Add debug info for file size threshold
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB
    if (fileSize > LARGE_FILE_THRESHOLD) {
      console.log(`📋 Large file detected (>${(LARGE_FILE_THRESHOLD / 1024 / 1024)}MB), using large file API`);
    } else {
      console.log(`📋 Small file detected (<${(LARGE_FILE_THRESHOLD / 1024 / 1024)}MB), using regular upload`);
    }
    
    // Enhanced progress callback with debug logging
    const enhancedProgressCallback = (progressData) => {
      console.log(`📊 Upload Progress: ${progressData.progress}% (${progressData.completedChunks || 0}/${progressData.totalChunks || 1} parts)`);
      if (progressCallback) {
        progressCallback(progressData);
      }
    };
    
    // Use the new optimized upload system that automatically handles:
    // - Small files (<100MB): Regular B2 upload
    // - Large files (>=100MB): B2 large file API with parallel parts and resumable uploads
    const result = await uploadFileWithRetry(filePath, fileName, 3, enhancedProgressCallback);
    
    console.log(`✅ Smart upload completed: ${result.fileId}`);
    return result;
    
  } catch (error) {
    console.error('❌ Smart upload failed:', error.message);
    
    // Enhanced error handling with cleanup suggestions
    if (error.message.includes('getaddrinfo ENOTFOUND')) {
      console.error('🚨 DNS Resolution Error Detected!');
      console.error('This appears to be a network connectivity issue with Backblaze B2 servers.');
      console.error('Possible solutions:');
      console.error('1. Check your internet connection');
      console.error('2. Verify DNS settings');
      console.error('3. Try again in a few minutes');
      console.error('4. Check if Backblaze B2 is experiencing outages');
      
      // Try to list and clean up any unfinished uploads
      try {
        console.log('🧹 Checking for unfinished uploads to clean up...');
        const unfinishedUploads = await listUnfinishedUploads();
        if (unfinishedUploads.length > 0) {
          console.log(`📋 Found ${unfinishedUploads.length} unfinished uploads that may need cleanup`);
        }
      } catch (cleanupError) {
        console.warn('⚠️ Could not check unfinished uploads:', cleanupError.message);
      }
    }
    
    throw error;
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
  
  return videoFolders[videoType] || 'videos';
};

// Helper function to validate video type
const validateVideoType = (videoType) => {
  const validTypes = ['film', 'episode', 'lesson'];
  return validTypes.includes(videoType);
};

const uploadVideo = async (req, res) => {
  const videoId = uuidv4();
  const videoType = req.query.type;

  try {
    if (!videoType || !validateVideoType(videoType)) {
      return errorResponse(res, 400, 'Invalid or missing video type. Use ?type=film|episode|lesson');
    }

    const file = req.file;
    if (!file || file.size > 10 * 1024 * 1024 * 1024) {
      return errorResponse(res, 400, 'Invalid video file or exceeds 10GB size limit.');
    }

    const allowedTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
    if (!allowedTypes.includes(file.mimetype)) {
      return errorResponse(res, 400, 'Unsupported video format.');
    }

    const fileExt = path.extname(file.originalname).toLowerCase();
    const videoFolder = getVideoFolder(videoType);
    const originalFileName = `${videoFolder}/${videoId}/original${fileExt}`;

    broadcastProgress(req.userId, videoId, videoType, 'uploading', 0, 'Starting video upload...');
    
    const uploadResult = await smartUpload(file.path, originalFileName, file.size, (progressData) =>
      broadcastProgress(req.userId, videoId, videoType, 'uploading', progressData.progress, progressData.message, progressData)
    );

    broadcastProgress(req.userId, videoId, videoType, 'uploading', 100, 'Upload complete, starting transcoding...');

    const buffer = fs.readFileSync(file.path);

    broadcastProgress(req.userId, videoId, videoType, 'transcoding', 0, 'Starting video transcoding...');
    
    const transcodeResult = await transcodeToHLS(buffer, videoId, videoType);

    broadcastProgress(req.userId, videoId, videoType, 'transcoding', 100, 'Video transcoding complete!');

    cleanupTempFile(file.path);

    const responseData = {
      _id: videoId,
      videoUrl: transcodeResult.videoUrl,
      originalVideoUrl: uploadResult.fileUrl,
      videoType,
      createdAt: new Date()
    };

    socketManager.broadcastUploadComplete(req.userId, {
      uploadType: 'video',
      uploadId: videoId,
      videoType,
      ...responseData,
      resolutions: transcodeResult.resolutions,
      duration: transcodeResult.duration
    });

    return successResponse(res, 201, 'Video uploaded and processed successfully', responseData, 'video');

  } catch (error) {
    console.error('Video upload failed:', error);

    socketManager.broadcastUploadError(req.userId, {
      uploadType: 'video',
      uploadId: videoId,
      videoType,
      error: error.message,
      stage: 'upload'
    });

    cleanupTempFile(req.file?.path);
    return errorResponse(res, 500, 'Video upload failed', error.message);
  }
};

// Utility wrapper for broadcasting upload progress
function broadcastProgress(userId, uploadId, videoType, stage, progress, message, extra = {}) {
  socketManager.broadcastUploadProgress(userId, {
    uploadType: 'video',
    uploadId,
    videoType,
    stage,
    progress,
    message,
    ...extra
  });
}

const uploadGeneralFile = async (req, res) => {
  let uploadId = null;
  
  try {
    console.log('📄 Starting general file upload to storage...');
    
    // File validation
    if (!req.file) {
      return errorResponse(res, 400, 'No file provided');
    }

    if (req.file.size > 1 * 1024 * 1024 * 1024) { // 1GB limit for general files
      return errorResponse(res, 400, 'File too large. Maximum size is 1GB');
    }

    uploadId = uuidv4();
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const fileName = `files/${uploadId}${fileExtension}`;

    console.log('📤 Starting file upload with smart handling...');
    
    // Send upload start event
    socketManager.broadcastUploadProgress(req.userId, {
      uploadType: 'file',
      uploadId: uploadId,
      stage: 'uploading',
      progress: 0,
      message: 'Starting file upload...'
    });
    
    const uploadResult = await smartUpload(
      req.file.path, 
      fileName,
      req.file.size,
      (progressData) => {
        // Progress callback for smart upload
        socketManager.broadcastUploadProgress(req.userId, {
          uploadType: 'file',
          uploadId: uploadId,
          stage: 'uploading',
          progress: progressData.progress,
          message: progressData.message || 'Uploading file...',
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
    
    console.log('✅ File upload complete');
    
    // Send upload complete event
    socketManager.broadcastUploadProgress(req.userId, {
      uploadType: 'file',
      uploadId: uploadId,
      stage: 'complete',
      progress: 100,
      message: 'File upload complete!'
    });

    // Clean up temp file
    cleanupTempFile(req.file.path);

    return successResponse(res, 'File uploaded successfully', {
      uploadId: uploadId,
      fileUrl: uploadResult.fileUrl,
      fileName: req.file.originalname,
      fileSize: req.file.size,
      mimeType: req.file.mimetype
    });

  } catch (error) {
    console.error('❌ File upload error:', error);
    
    // Send error event
    if (uploadId) {
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType: 'file',
        uploadId: uploadId,
        stage: 'error',
        progress: 0,
        message: 'File upload failed',
        error: error.message
      });
    }

    // Clean up temp file
    if (req.file?.path) {
      cleanupTempFile(req.file.path);
    }
    
    return errorResponse(res, 500, 'File upload failed', error.message);
  }
};

/**
 * List unfinished large file uploads for cleanup and monitoring
 * GET /api/upload/unfinished
 */
const listUnfinishedLargeFiles = async (req, res) => {
  try {
    console.log('📋 Listing unfinished large file uploads...');
    
    const unfinishedFiles = await listUnfinishedUploads();
    
    // Filter and format the response
    const formattedFiles = unfinishedFiles.map(file => ({
      fileId: file.fileId,
      fileName: file.fileName,
      uploadTimestamp: file.uploadTimestamp,
      contentType: file.contentType,
      fileInfo: file.fileInfo,
      size: file.fileInfo?.file_size || 'Unknown',
      ageHours: Math.round((Date.now() - file.uploadTimestamp) / (1000 * 60 * 60))
    }));
    
    console.log(`📋 Found ${formattedFiles.length} unfinished uploads`);
    
    return successResponse(res, 'Unfinished uploads retrieved successfully', {
      count: formattedFiles.length,
      files: formattedFiles
    });
    
  } catch (error) {
    console.error('❌ Failed to list unfinished uploads:', error);
    return errorResponse(res, 500, 'Failed to list unfinished uploads', error.message);
  }
};

/**
 * Cancel/cleanup specific unfinished large file upload
 * DELETE /api/upload/unfinished/:fileId
 */
const cancelUnfinishedUpload = async (req, res) => {
  try {
    const { fileId } = req.params;
    
    if (!fileId) {
      return errorResponse(res, 400, 'File ID is required');
    }
    
    console.log(`🧹 Canceling unfinished upload: ${fileId}`);
    
    const { cancelLargeFileUpload } = require('../utils/chunkedUpload');
    await cancelLargeFileUpload(fileId);
    
    console.log(`✅ Successfully canceled upload: ${fileId}`);
    
    return successResponse(res, 'Upload canceled successfully', {
      fileId: fileId,
      status: 'canceled'
    });
    
  } catch (error) {
    console.error('❌ Failed to cancel upload:', error);
    return errorResponse(res, 500, 'Failed to cancel upload', error.message);
  }
};

/**
 * Bulk cleanup of old unfinished uploads
 * POST /api/upload/cleanup
 */
const cleanupOldUploads = async (req, res) => {
  try {
    const { olderThanHours = 24 } = req.body; // Default: cleanup uploads older than 24 hours
    
    console.log(`🧹 Starting cleanup of uploads older than ${olderThanHours} hours...`);
    
    const unfinishedFiles = await listUnfinishedUploads();
    const cutoffTime = Date.now() - (olderThanHours * 60 * 60 * 1000);
    
    const filesToCleanup = unfinishedFiles.filter(file => file.uploadTimestamp < cutoffTime);
    
    if (filesToCleanup.length === 0) {
      return successResponse(res, 'No old uploads found to cleanup', {
        checked: unfinishedFiles.length,
        cleaned: 0
      });
    }
    
    console.log(`📋 Found ${filesToCleanup.length} uploads to cleanup`);
    
    const { cancelLargeFileUpload } = require('../utils/chunkedUpload');
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };
    
    // Cancel uploads in parallel (with concurrency limit)
    const CLEANUP_BATCH_SIZE = 5;
    for (let i = 0; i < filesToCleanup.length; i += CLEANUP_BATCH_SIZE) {
      const batch = filesToCleanup.slice(i, i + CLEANUP_BATCH_SIZE);
      
      const promises = batch.map(async (file) => {
        try {
          await cancelLargeFileUpload(file.fileId);
          results.success++;
          console.log(`✅ Cleaned up: ${file.fileName} (${file.fileId})`);
        } catch (error) {
          results.failed++;
          results.errors.push({
            fileId: file.fileId,
            fileName: file.fileName,
            error: error.message
          });
          console.error(`❌ Failed to cleanup ${file.fileId}:`, error.message);
        }
      });
      
      await Promise.all(promises);
    }
    
    console.log(`✅ Cleanup completed: ${results.success} successful, ${results.failed} failed`);
    
    return successResponse(res, 'Cleanup completed', {
      checked: unfinishedFiles.length,
      cleaned: results.success,
      failed: results.failed,
      errors: results.errors
    });
    
  } catch (error) {
    console.error('❌ Bulk cleanup failed:', error);
    return errorResponse(res, 500, 'Bulk cleanup failed', error.message);
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
  uploadGeneralFile,
  
  // New upload management endpoints
  listUnfinishedLargeFiles,
  cancelUnfinishedUpload,
  cleanupOldUploads
}; 