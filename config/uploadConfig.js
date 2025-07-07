const multer = require('multer');
const path = require('path');
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

// Enhanced upload configuration for large files
const createUploadMiddleware = (fileSizeLimit = 10 * 1024 * 1024 * 1024) => {
  return multer({
    storage: storage,
    limits: {
      fileSize: fileSizeLimit, // 10GB default
      fieldSize: 10 * 1024 * 1024, // 10MB for form fields
      files: 1, // Only one file at a time
      fields: 10, // Maximum 10 form fields
    },
    fileFilter: (req, file, cb) => {
      // Add request timeout for large files
      if (req.path.includes('/video') && file.size > 100 * 1024 * 1024) {
        // For videos larger than 100MB, set longer timeout
        req.setTimeout(7200000); // 2 hours
        res.setTimeout(7200000); // 2 hours
      }
      
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
};

// Specific upload middlewares for different file types
const uploadImage = createUploadMiddleware(10 * 1024 * 1024); // 10MB for images
const uploadVideo = createUploadMiddleware(10 * 1024 * 1024 * 1024); // 10GB for videos
const uploadFile = createUploadMiddleware(1 * 1024 * 1024 * 1024); // 1GB for general files

// Error handling middleware for multer
const handleMulterError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: 'File too large',
        error: `File size exceeds the limit. Maximum allowed: ${error.limit / (1024 * 1024 * 1024)}GB`
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many files',
        error: 'Only one file can be uploaded at a time'
      });
    }
    if (error.code === 'LIMIT_FIELD_COUNT') {
      return res.status(400).json({
        success: false,
        message: 'Too many form fields',
        error: 'Too many form fields in the request'
      });
    }
  }
  
  // Handle other errors
  return res.status(500).json({
    success: false,
    message: 'Upload failed',
    error: error.message
  });
};

module.exports = {
  uploadImage,
  uploadVideo,
  uploadFile,
  handleMulterError,
  createUploadMiddleware
}; 