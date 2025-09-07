const express = require('express');
const router = express.Router();
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

// User notification endpoints
router.get('/list', authMiddleware, notificationController.getUserNotifications);
router.get('/categories', authMiddleware, notificationController.getNotificationCategories);

// Admin-only notification endpoints
router.post('/admin/send', adminAuthMiddleware, notificationController.sendAdminNotification);
router.get('/admin/history', adminAuthMiddleware, notificationController.getAdminNotificationHistory);

module.exports = router; 