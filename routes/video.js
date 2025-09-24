const express = require('express');
const router = express.Router();
const { postVideo, getRandomSuggestion, getContinueWatching } = require('../controllers/video');
const { 
  getRandomFilms, 
  getPopularFilms,
  getAllFilms,
  getFilmById,
  updateFilm,
  deleteFilm
} = require('../controllers/film');
const { 
  getAllEpisodes,
  getEpisodeById,
  updateEpisode,
  deleteEpisode
} = require('../controllers/episodeAdmin');
const { getRandomSeries } = require('../controllers/series');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Admin-only video content management
router.post('/add-video', adminAuthMiddleware, postVideo);

// Admin APIs for Films
router.get('/admin/films/all', adminAuthMiddleware, getAllFilms);
router.get('/admin/films/get', adminAuthMiddleware, getFilmById);
router.put('/admin/films/update', adminAuthMiddleware, updateFilm);
router.delete('/admin/films/delete', adminAuthMiddleware, deleteFilm);

// Admin APIs for Episodes
router.get('/admin/episodes/all', adminAuthMiddleware, getAllEpisodes);
router.get('/admin/episodes/get', adminAuthMiddleware, getEpisodeById);
router.put('/admin/episodes/update', adminAuthMiddleware, updateEpisode);
router.delete('/admin/episodes/delete', adminAuthMiddleware, deleteEpisode);

router.use(authMiddleware); 

router.get('/suggestion', getRandomSuggestion);
router.get('/continue-watching', getContinueWatching);
router.get('/films', getRandomFilms);
router.get('/series', getRandomSeries);
router.get('/popular', getPopularFilms);

module.exports = router;
