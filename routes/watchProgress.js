const express = require('express');
const router = express.Router();
const { updateWatchProgress, getWatchProgress } = require('../controllers/watchProgress');
const authMiddleware = require('../middlewares/auth');

// Apply auth middleware to all routes
router.use(authMiddleware);

// POST /api/watch-progress
router.post('/', updateWatchProgress);

// GET /api/watch-progress
router.get('/', getWatchProgress);

module.exports = router; 