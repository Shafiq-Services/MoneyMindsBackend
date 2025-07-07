const router = require('express').Router();
const authMiddleware = require('../middlewares/auth');

// Controllers
const {
  submitContact,
  getAllContacts
} = require('../controllers/contactController');

// Public route (no authentication required)
router.post('/submit', submitContact);

// Protected route (authentication required)
router.get('/list', authMiddleware, getAllContacts);

module.exports = router; 