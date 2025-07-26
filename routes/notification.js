const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const notificationController = require('../controllers/notificationController');

router.use(authMiddleware);

// User notification endpoints
router.get('/list', notificationController.getUserNotifications);
router.get('/categories', notificationController.getNotificationCategories);

// Admin notification endpoints (using user middleware for now)
router.post('/admin/send', notificationController.sendAdminNotification);
router.get('/admin/history', notificationController.getAdminNotificationHistory);

module.exports = router; 