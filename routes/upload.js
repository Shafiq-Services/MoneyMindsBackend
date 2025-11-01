const express = require('express');
const router = express.Router();
const {
  uploadImage,
  uploadGeneralFile,
  upload,
  queuedUploadVideo,
  getUploadStatus
} = require('../controllers/upload');
const { authMiddleware } = require('../middlewares/auth');
const { errorResponse } = require('../utils/apiResponse');
const multer = require('multer');

// Enhanced error handling for large file uploads
const enhancedErrorHandler = (err, req, res, next) => {
  console.error('Upload error:', err);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 400, 'File too large. Maximum size is 10GB');
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return errorResponse(res, 400, 'Unexpected file field');
    }
    return errorResponse(res, 400, 'File upload error', err.message);
  }
  
  if (err) {
    return errorResponse(res, 400, 'File validation error', err.message);
  }
  
  next();
};

// Protected upload routes (authentication required)
// Video upload - Asynchronous with Bull Queue to prevent Azure timeouts
router.post('/video', authMiddleware, upload.single('video'), enhancedErrorHandler, queuedUploadVideo);

// Upload status endpoint for polling
router.get('/status', authMiddleware, getUploadStatus);

// Other upload routes (kept for backwards compatibility)
router.post('/image', authMiddleware, upload.single('image'), enhancedErrorHandler, uploadImage);
router.post('/file', upload.single('file'), enhancedErrorHandler, uploadGeneralFile);

module.exports = router; 