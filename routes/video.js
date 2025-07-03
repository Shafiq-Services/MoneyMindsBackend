const express = require('express');
const router = express.Router();
const { postVideo, getRandomSuggestion, getContinueWatching } = require('../controllers/video');
const authMiddleware = require('../middlewares/auth');

// POST /api/video
router.post('/add-video', postVideo);

router.use(authMiddleware); 

router.get('/suggestion', getRandomSuggestion);
router.get('/continue-watching', getContinueWatching);

module.exports = router;
