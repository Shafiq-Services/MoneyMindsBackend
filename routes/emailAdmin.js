const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middlewares/auth');

// Controllers
const {
  getAllEmails,
  getEmailById,
  sendBulkEmail,
  getUsersForEmail,
  getEmailStats
} = require('../controllers/emailController');

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Email Management Routes
router.get('/list', getAllEmails);
router.get('/get', getEmailById);
router.post('/send', sendBulkEmail);
router.get('/stats', getEmailStats);

// Users for email selection
router.get('/users/list', getUsersForEmail);

module.exports = router;
