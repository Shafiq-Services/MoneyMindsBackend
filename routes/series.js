const express = require('express');
const router = express.Router();
const { addSeries, getRandomSeries } = require('../controllers/series');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Admin-only series creation, public access for viewing
router.post('/add-series', adminAuthMiddleware, addSeries);
router.get('/', authMiddleware, getRandomSeries);

module.exports = router; 