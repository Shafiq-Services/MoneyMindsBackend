const express = require('express');
const router = express.Router();
const { addSeries } = require('../controllers/series');
const authMiddleware = require('../middlewares/auth');

// POST /api/series
router.use(authMiddleware);
router.post('/add-series', addSeries);

module.exports = router; 