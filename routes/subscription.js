const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middlewares/auth');

// Route to create a new subscription
router.post('/buy-plan', authMiddleware, subscriptionController.createSubscription);

// Route to cancel a subscription
router.post('/cancel', authMiddleware, subscriptionController.cancelSubscription);

// Route to get subscription status
router.get('/status', authMiddleware, subscriptionController.getSubscriptionStatus);

// The webhook route is now handled in server.js to accommodate the raw body parser.

module.exports = router;
