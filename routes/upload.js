const express = require('express');
const router = express.Router();
const {
  upload,
  uploadImage,
  uploadVideo,
} = require('../controllers/upload');
const authMiddleware = require('../middlewares/auth');
const { errorResponse } = require('../utils/apiResponse');
const multer = require('multer');

// Apply authentication to all upload routes
router.use(authMiddleware);

// Error handling middleware for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return errorResponse(res, 400, 'File too large. Maximum size is 500MB');
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

// Image upload route
router.post('/image', upload.single('image'), handleMulterError, uploadImage);

// Video upload route
router.post('/video', upload.single('video'), handleMulterError, uploadVideo);

module.exports = router; 