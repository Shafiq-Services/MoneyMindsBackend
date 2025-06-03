const express = require('express');
const router = express.Router();
const {
  uploadImageWithProgress,
  uploadVideoWithProgress,
  getUploadProgress,
} = require('../controllers/uploadWithProgress');
const authMiddleware = require('../middlewares/auth');

// Apply authentication middleware to all upload routes
router.use(authMiddleware);

// Real-time progress upload routes
router.post('/image', uploadImageWithProgress);
router.post('/video', uploadVideoWithProgress);

// Get upload progress for any file type
router.get('/progress/:progressId', getUploadProgress);

module.exports = router; 