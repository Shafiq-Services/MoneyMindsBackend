const express = require('express');
const router = express.Router();
const {
  uploadImage,
  uploadVideo,
  uploadGeneralFile,
  upload
} = require('../controllers/upload');
const authMiddleware = require('../middlewares/auth');
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

// Public upload routes (no authentication required)
router.post('/file', upload.single('file'), enhancedErrorHandler, uploadGeneralFile);

// Protected upload routes (authentication required)
router.post('/image', authMiddleware, upload.single('image'), enhancedErrorHandler, uploadImage);
router.post('/video', authMiddleware, upload.single('video'), enhancedErrorHandler, uploadVideo);

module.exports = router; 