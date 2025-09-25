const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFileSmart } = require('../utils/b2OfficialMultithreaded');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const { convertToFullUrl } = require('../utils/urlHelper');
const fs = require('fs');

// Configure multer for disk storage to handle large files efficiently
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../temp/uploads');
    // Only use existing temp directory - don't create missing directories
    try {
      if (!fs.existsSync(uploadDir)) {
        const error = new Error('Upload temp directory does not exist. Please ensure temp/uploads directory is created.');
        console.error('❌ [Upload] Temp directory missing:', uploadDir);
        return cb(error, null);
      }
      cb(null, uploadDir);
    } catch (error) {
      console.error('❌ [Upload] Error checking upload directory:', error.message);
      cb(error, null);
    }
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
      const allowedVideoTypes = [
        'video/mp4', 
        'video/avi', 
        'video/mov', 
        'video/wmv', 
        'video/flv', 
        'video/webm', 
        'video/mkv',
        'video/x-matroska',  // Common MKV MIME type
        'application/x-matroska'  // Alternative MKV MIME type
      ];
      
      // Also check file extension as fallback for MKV files
      const fileExtension = path.extname(file.originalname).toLowerCase();
      const isMkvByExtension = fileExtension === '.mkv';
      
      if (allowedVideoTypes.includes(file.mimetype) || isMkvByExtension) {
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

// Unified folder mapping for all upload types
const getUploadFolder = (type, uploadType) => {
  if (uploadType === 'video') {
    const videoFolders = {
      'film': 'videos/films',
      'episode': 'videos/episodes', 
      'lesson': 'videos/lessons'
    };
    return videoFolders[type] || 'videos';
  } else if (uploadType === 'image') {
    const imageFolders = {
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
      'contact': 'files/contact',
      'landing': 'images/landing'
    };
    return imageFolders[type]; // No fallback - only predefined types allowed
  } else if (uploadType === 'file') {
    return 'files';
  }
  return 'uploads';
};

// Unified type validation
const validateUploadType = (type, uploadType) => {
  if (uploadType === 'video') {
    return ['film', 'episode', 'lesson'].includes(type);
  } else if (uploadType === 'image') {
    return ['campus', 'course', 'video', 'series', 'book', 'user', 'avatar', 'banner', 'marketplace', 'feed', 'chat', 'contact', 'landing'].includes(type);
  }
  return true; // Files don't need type validation
};

// Helper function to clean up temporary files (enhanced)
const cleanupTempFile = (filePath) => {
  if (!filePath) return;
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Failed to cleanup temp file:', err.message);
        } else {
          console.log('✅ Temp file cleaned up:', path.basename(filePath));
        }
      });
    }
  } catch (error) {
    console.warn('Error during temp file cleanup:', error.message);
  }
};

// Safe socket manager wrapper to prevent upload failures
const safeSocketBroadcast = (method, userId, data) => {
  try {
    if (userId && socketManager && typeof socketManager[method] === 'function') {
      socketManager[method](userId, data);
    }
  } catch (error) {
    console.warn(`[Upload] Socket broadcast failed (${method}):`, error.message);
    // Continue upload process even if socket fails
  }
};

/**
 * Unified upload function that handles all upload types
 */
const unifiedUpload = async (req, res, uploadType) => {
  const uploadId = uuidv4();
  const type = req.query.type;
  
  // Validate userId from auth middleware
  if (!req.userId) {
    return errorResponse(res, 401, 'User authentication required');
  }
  
  try {
    // Validate upload type and type parameter
    if (uploadType === 'image' && !type) {
      return errorResponse(res, 400, 'Image type is required. Use query parameter: ?type=campus|course|video|series|book|user|avatar|banner|marketplace|feed|chat|landing');
    }
    
    if (uploadType === 'video' && (!type || !validateUploadType(type, uploadType))) {
      return errorResponse(res, 400, 'Invalid or missing video type. Use ?type=film|episode|lesson');
    }
    
    if (uploadType === 'image' && !validateUploadType(type, uploadType)) {
      return errorResponse(res, 400, 'Invalid image type. Valid types: campus, course, video, series, book, user, avatar, banner, marketplace, feed, chat, landing');
    }
    
    // Additional validation: ensure folder mapping exists for image types
    if (uploadType === 'image') {
      const folder = getUploadFolder(type, uploadType);
      if (!folder) {
        return errorResponse(res, 400, `Unsupported image type: ${type}. Only predefined image types are allowed.`);
      }
    }

    if (!req.file) {
      return errorResponse(res, 400, `No ${uploadType} file provided`);
    }

    // File size validation
    const maxSizes = {
      'image': 10 * 1024 * 1024, // 10MB
      'video': 10 * 1024 * 1024 * 1024, // 10GB
      'file': 1 * 1024 * 1024 * 1024 // 1GB
    };
    
    if (req.file.size > maxSizes[uploadType]) {
      cleanupTempFile(req.file.path);
      return errorResponse(res, 400, `File size exceeds ${(maxSizes[uploadType] / 1024 / 1024).toFixed(0)}MB limit`);
    }

    // File type validation
    const allowedTypes = {
      'image': ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'],
      'video': [
        'video/mp4', 
        'video/avi', 
        'video/mov', 
        'video/wmv', 
        'video/flv', 
        'video/webm', 
        'video/mkv',
        'video/x-matroska',  // Common MKV MIME type
        'application/x-matroska'  // Alternative MKV MIME type
      ],
      'file': [] // Allow any file type
    };
    
    // Special handling for MKV files by extension
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    const isMkvByExtension = fileExtension === '.mkv';
    
    if (uploadType !== 'file' && !allowedTypes[uploadType].includes(req.file.mimetype) && !(uploadType === 'video' && isMkvByExtension)) {
      console.log(`🚫 [Upload Validation] File rejected: ${req.file.originalname}`);
      console.log(`🚫 [Upload Validation] Detected MIME type: ${req.file.mimetype}`);
      console.log(`🚫 [Upload Validation] File extension: ${fileExtension}`);
      console.log(`🚫 [Upload Validation] Upload type: ${uploadType}`);
      cleanupTempFile(req.file.path);
      return errorResponse(res, 400, `Invalid ${uploadType} file type. Detected MIME type: ${req.file.mimetype}`);
    }

    // Generate file path
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const folder = getUploadFolder(type, uploadType);
    const fileName = uploadType === 'video' 
      ? `${folder}/${uploadId}/original${fileExt}`
      : `${folder}/${uploadId}${fileExt}`;

    // Broadcast upload start (with error handling)
    safeSocketBroadcast('broadcastUploadProgress', req.userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      stage: 'uploading',
      progress: 0,
      message: `Starting ${uploadType} upload...`
    });

    // Upload file with timeout protection
    console.log(`📤 [Upload] Starting ${uploadType} upload for user ${req.userId}: ${req.file.originalname}`);
    
    const uploadResult = await Promise.race([
      uploadFileSmart(req.file.path, fileName, (progressData) => {
        safeSocketBroadcast('broadcastUploadProgress', req.userId, {
          uploadType,
          uploadId,
          ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
          stage: 'uploading',
          progress: progressData.progress,
          message: progressData.message || `Uploading ${uploadType}...`,
          ...progressData
        });
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Upload timeout after 10 minutes')), 10 * 60 * 1000)
      )
    ]);
    
    console.log(`✅ [Upload] Upload completed for user ${req.userId}: ${uploadResult.fileUrl}`);

    // Handle video transcoding
    let transcodeResult = null;
    if (uploadType === 'video') {
      safeSocketBroadcast('broadcastUploadProgress', req.userId, {
        uploadType,
        uploadId,
        videoType: type,
        stage: 'transcoding',
        progress: 0,
        message: 'Starting video transcoding...'
      });

      const buffer = fs.readFileSync(req.file.path);
      transcodeResult = await transcodeToHLS(buffer, uploadId, type);

      safeSocketBroadcast('broadcastUploadProgress', req.userId, {
        uploadType,
        uploadId,
        videoType: type,
        stage: 'transcoding',
        progress: 100,
        message: 'Video transcoding complete!'
      });
    }

    // Cleanup and prepare response
    cleanupTempFile(req.file.path);

    const responseData = {
      _id: uploadId,
      ...(uploadType === 'video' ? {
        videoUrl: convertToFullUrl(transcodeResult.videoUrl),
        originalVideoUrl: convertToFullUrl(uploadResult.fileUrl),
        videoType: type,
        resolutions: transcodeResult.resolutions,
        duration: transcodeResult.duration
      } : uploadType === 'image' ? {
        imageUrl: convertToFullUrl(uploadResult.fileUrl),
        imageType: type
      } : {
        fileUrl: convertToFullUrl(uploadResult.fileUrl),
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      }),
      createdAt: new Date()
    };

    // Broadcast completion (with error handling) - URLs already converted in responseData
    safeSocketBroadcast('broadcastUploadComplete', req.userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      ...responseData
    });
    
    console.log(`🎉 [Upload] ${uploadType} upload successfully completed for user ${req.userId}`);

    return successResponse(res, 201, `${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} uploaded successfully`, responseData, uploadType);

  } catch (error) {
    console.error(`❌ [Upload] ${uploadType} upload failed for user ${req.userId}:`, error.message);
    console.error(`❌ [Upload] Error details:`, {
      uploadId,
      type,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      errorStack: error.stack
    });

    // Broadcast error (with error handling)
    safeSocketBroadcast('broadcastUploadError', req.userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      error: error.message,
      stage: 'upload'
    });

    // Ensure temp file cleanup
    try {
      cleanupTempFile(req.file?.path);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError.message);
    }
    
    // Return appropriate error based on error type
    if (error.message.includes('timeout')) {
      return errorResponse(res, 408, 'Upload timeout', 'The upload took too long and was cancelled');
    }
    
    return errorResponse(res, 500, `${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} upload failed`, error.message);
  }
};

const uploadImage = async (req, res) => {
  return unifiedUpload(req, res, 'image');
};

const uploadVideo = async (req, res) => {
  return unifiedUpload(req, res, 'video');
};

const uploadGeneralFile = async (req, res) => {
  return unifiedUpload(req, res, 'file');
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
  uploadGeneralFile
}; 