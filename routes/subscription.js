const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const authMiddleware = require('../middlewares/auth');

// Subscription Plans (Authentication required)
router.get('/plans', authMiddleware, subscriptionController.getSubscriptionPlans);
router.get('/plan', authMiddleware, subscriptionController.getSubscriptionPlan);

// Subscription
router.post('/buy-plan', authMiddleware, subscriptionController.createSubscription);
router.post('/cancel', authMiddleware, subscriptionController.cancelSubscription);
router.get('/status', authMiddleware, subscriptionController.getSubscriptionStatus);
router.get('/current', authMiddleware, subscriptionController.getCurrentSubscription);

// Payment Methods
router.get('/payment-method/list', authMiddleware, subscriptionController.listPaymentMethods);
router.post('/payment-method/add', authMiddleware, subscriptionController.addPaymentMethod);
router.put('/payment-method/edit', authMiddleware, subscriptionController.editPaymentMethod);
router.delete('/payment-method/delete', authMiddleware, subscriptionController.deletePaymentMethod);

// Billing Info
router.get('/billing-info/get', authMiddleware, subscriptionController.getBillingInfo);
router.put('/billing-info/edit', authMiddleware, subscriptionController.editBillingInfo);
router.delete('/billing-info/delete', authMiddleware, subscriptionController.deleteBillingInfo);

// The webhook route is now handled in server.js to accommodate the raw body parser.

module.exports = router;
