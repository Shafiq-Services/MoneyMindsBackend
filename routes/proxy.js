const express = require('express');
const router = express.Router();
const { proxyImage, proxyVideo } = require('../controllers/proxy');

router.get('/image', proxyImage);
router.get('/video', proxyVideo);

module.exports = router;
