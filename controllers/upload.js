const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFileSmart } = require('../utils/b2OfficialMultithreaded');
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
      'contact': 'files/contact'
    };
    return imageFolders[type] || 'images';
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
    return ['campus', 'course', 'video', 'series', 'book', 'user', 'avatar', 'banner', 'marketplace', 'feed', 'chat', 'contact'].includes(type);
  }
  return true; // Files don't need type validation
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
 * Unified upload function that handles all upload types
 */
const unifiedUpload = async (req, res, uploadType) => {
  const uploadId = uuidv4();
  const type = req.query.type;
  
  try {
    // Validate upload type and type parameter
    if (uploadType === 'image' && !type) {
      return errorResponse(res, 400, 'Image type is required. Use query parameter: ?type=campus|course|video|series|book|user|avatar|banner|marketplace|feed|chat');
    }
    
    if (uploadType === 'video' && (!type || !validateUploadType(type, uploadType))) {
      return errorResponse(res, 400, 'Invalid or missing video type. Use ?type=film|episode|lesson');
    }
    
    if (uploadType === 'image' && !validateUploadType(type, uploadType)) {
      return errorResponse(res, 400, 'Invalid image type. Valid types: campus, course, video, series, book, user, avatar, banner, marketplace, feed, chat');
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
      'video': ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'],
      'file': [] // Allow any file type
    };
    
    if (uploadType !== 'file' && !allowedTypes[uploadType].includes(req.file.mimetype)) {
      cleanupTempFile(req.file.path);
      return errorResponse(res, 400, `Invalid ${uploadType} file type`);
    }

    // Generate file path
    const fileExt = path.extname(req.file.originalname).toLowerCase();
    const folder = getUploadFolder(type, uploadType);
    const fileName = uploadType === 'video' 
      ? `${folder}/${uploadId}/original${fileExt}`
      : `${folder}/${uploadId}${fileExt}`;

    // Broadcast upload start
    socketManager.broadcastUploadProgress(req.userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      stage: 'uploading',
      progress: 0,
      message: `Starting ${uploadType} upload...`
    });

    // Upload file
    const uploadResult = await uploadFileSmart(file.path, fileName, file.size, (progressData) => {
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType,
        uploadId,
        ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
        stage: 'uploading',
        progress: progressData.progress,
        message: progressData.message || `Uploading ${uploadType}...`,
        ...progressData
      });
    });

    // Handle video transcoding
    let transcodeResult = null;
    if (uploadType === 'video') {
      socketManager.broadcastUploadProgress(req.userId, {
        uploadType,
        uploadId,
        videoType: type,
        stage: 'transcoding',
        progress: 0,
        message: 'Starting video transcoding...'
      });

      const buffer = fs.readFileSync(file.path);
      transcodeResult = await transcodeToHLS(buffer, uploadId, type);

      socketManager.broadcastUploadProgress(req.userId, {
        uploadType,
        uploadId,
        videoType: type,
        stage: 'transcoding',
        progress: 100,
        message: 'Video transcoding complete!'
      });
    }

    // Cleanup and prepare response
    cleanupTempFile(file.path);

    const responseData = {
      _id: uploadId,
      ...(uploadType === 'video' ? {
        videoUrl: transcodeResult.videoUrl,
        originalVideoUrl: uploadResult.fileUrl,
        videoType: type,
        resolutions: transcodeResult.resolutions,
        duration: transcodeResult.duration
      } : uploadType === 'image' ? {
        imageUrl: uploadResult.fileUrl,
        imageType: type
      } : {
        fileUrl: uploadResult.fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype
      }),
      createdAt: new Date()
    };

    // Broadcast completion
    socketManager.broadcastUploadComplete(req.userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      ...responseData
    });

    return successResponse(res, 201, `${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} uploaded successfully`, responseData, uploadType);

  } catch (error) {
    console.error(`${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} upload failed:`, error);

    socketManager.broadcastUploadError(req.userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      error: error.message,
      stage: 'upload'
    });

    cleanupTempFile(req.file?.path);
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