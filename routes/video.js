const express = require('express');
const router = express.Router();
const { postVideo, getRandomSuggestion, getContinueWatching } = require('../controllers/video');
const { getRandomFilms, getPopularFilms } = require('../controllers/film');
const { getRandomSeries } = require('../controllers/series');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Admin-only video content management
router.post('/add-video', adminAuthMiddleware, postVideo);

router.use(authMiddleware); 

router.get('/suggestion', getRandomSuggestion);
router.get('/continue-watching', getContinueWatching);
router.get('/films', getRandomFilms);
router.get('/series', getRandomSeries);
router.get('/popular', getPopularFilms);

module.exports = router;
