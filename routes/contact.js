const router = require('express').Router();
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Controllers
const {
  submitContact,
  getAllContacts
} = require('../controllers/contactController');

// Public route (no authentication required)
router.post('/submit', submitContact);

// Admin-only route to view contact submissions
router.get('/list', adminAuthMiddleware, getAllContacts);

module.exports = router; 