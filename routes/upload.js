const express = require('express');
const router = express.Router();
const {
  upload,
  uploadImage,
  uploadVideo,
} = require('../controllers/upload');
const authMiddleware = require('../middlewares/auth');

// router.use(authMiddleware);

// Image upload route
router.post('/image', upload.single('image'), uploadImage);

// Video upload route
router.post('/video', upload.single('video'), uploadVideo);

module.exports = router; 