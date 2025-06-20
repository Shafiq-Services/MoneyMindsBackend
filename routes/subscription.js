const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middlewares/auth');

// Route to create a new subscription
router.post('/create', authMiddleware, subscriptionController.createSubscription);

// The webhook route is now handled in server.js to accommodate the raw body parser.

module.exports = router;
