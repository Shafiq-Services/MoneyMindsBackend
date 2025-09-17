const router = require('express').Router();
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Controllers
const {
  submitContact,
  getAllContacts,
  updateContactStatus,
  replyToContact,
  getContactById,
  getContactStats
} = require('../controllers/contactController');

// Public route (no authentication required)
router.post('/submit', submitContact);

// Admin-only routes
router.get('/list', adminAuthMiddleware, getAllContacts);
router.get('/get', adminAuthMiddleware, getContactById);
router.put('/status', adminAuthMiddleware, updateContactStatus);
router.post('/reply', adminAuthMiddleware, replyToContact);
router.get('/stats', adminAuthMiddleware, getContactStats);

module.exports = router; 