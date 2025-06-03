const express = require('express');
const router = express.Router();
const {
  upload,
  uploadImage,
  uploadVideo,
  getVideoStatus,
  getUploadProgress,
} = require('../controllers/upload');
const authMiddleware = require('../middlewares/auth');

// router.use(authMiddleware);

// Image upload route
router.post('/image', upload.single('image'), uploadImage);

// Video upload route
router.post('/video', upload.single('video'), uploadVideo);

// Get video processing status
router.get('/video/status', getVideoStatus);

// Get upload progress for any file type
router.get('/progress/:progressId', getUploadProgress);

module.exports = router; 