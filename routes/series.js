const express = require('express');
const router = express.Router();
const { 
  addSeries, 
  getRandomSeries,
  getAllSeries,
  getSeriesById,
  updateSeries,
  deleteSeries,
  getSeriesSeasons
} = require('../controllers/series');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Admin-only series creation, public access for viewing
router.post('/add-series', adminAuthMiddleware, addSeries);
router.get('/', authMiddleware, getRandomSeries);

// Admin APIs
router.get('/admin/all', adminAuthMiddleware, getAllSeries);
router.get('/admin/get', adminAuthMiddleware, getSeriesById);
router.get('/admin/seasons', adminAuthMiddleware, getSeriesSeasons);
router.put('/admin/update', adminAuthMiddleware, updateSeries);
router.delete('/admin/delete', adminAuthMiddleware, deleteSeries);

module.exports = router; 