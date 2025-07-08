const express = require('express');
const router = express.Router();
const {
  uploadImage,
  uploadVideo,
  uploadGeneralFile,
  listUnfinishedLargeFiles,
  cancelUnfinishedUpload,
  cleanupOldUploads
} = require('../controllers/upload');
const authMiddleware = require('../middlewares/auth');
const { errorResponse } = require('../utils/apiResponse');
const multer = require('multer');
const { 
  uploadImage: uploadImageMiddleware, 
  uploadVideo: uploadVideoMiddleware, 
  uploadFile: uploadFileMiddleware,
  handleMulterError 
} = require('../config/uploadConfig');

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
router.post('/file', uploadFileMiddleware.single('file'), enhancedErrorHandler, uploadGeneralFile);

// Protected upload routes (authentication required)
router.post('/image', authMiddleware, uploadImageMiddleware.single('image'), enhancedErrorHandler, uploadImage);
router.post('/video', authMiddleware, uploadVideoMiddleware.single('video'), enhancedErrorHandler, uploadVideo);

// Upload management endpoints for large file handling
router.get('/unfinished', authMiddleware, listUnfinishedLargeFiles);
router.delete('/unfinished/:fileId', authMiddleware, cancelUnfinishedUpload);
router.post('/cleanup', authMiddleware, cleanupOldUploads);

module.exports = router; 