const express = require('express');
const router = express.Router();
const {
  upload,
  uploadImage,
  uploadVideo,
  uploadGeneralFile,
} = require('../controllers/upload');
const authMiddleware = require('../middlewares/auth');
const { errorResponse } = require('../utils/apiResponse');
const multer = require('multer');

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
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
router.post('/file', upload.single('file'), handleMulterError, uploadGeneralFile);

// Protected upload routes (authentication required)
router.post('/image', authMiddleware, upload.single('image'), handleMulterError, uploadImage);
router.post('/video', authMiddleware, upload.single('video'), handleMulterError, uploadVideo);



module.exports = router; 