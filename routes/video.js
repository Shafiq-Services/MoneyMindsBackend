const express = require('express');
const router = express.Router();
const { postVideo, getRandomFilms, getRandomSeries, getRandomSuggestion } = require('../controllers/video');
const authMiddleware = require('../middlewares/auth');

// POST /api/video
router.post('/add-video', postVideo);

router.use(authMiddleware); 

router.get('/films', getRandomFilms);

router.get('/series', getRandomSeries);

router.get('/suggestion', getRandomSuggestion);

module.exports = router;
