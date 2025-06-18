const express = require('express');
const router = express.Router();
const { getRandomFilms } = require('../controllers/film');
const authMiddleware = require('../middlewares/auth');

router.use(authMiddleware);
router.get('/', getRandomFilms);

module.exports = router; 