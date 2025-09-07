const express = require('express');
const router = express.Router();
const {
  createCampus,
  editCampus,
  deleteCampus,
  joinCampus,
  leaveCampus,
  listCampuses,
  getUserCampuses,
  getCampusById
} = require('../controllers/campusController');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Public campus routes (require user authentication)
router.get('/list', authMiddleware, listCampuses);
router.get('/user', authMiddleware, getUserCampuses);
router.get('/', authMiddleware, getCampusById);
router.post('/join', authMiddleware, joinCampus);
router.post('/leave', authMiddleware, leaveCampus);

// Admin-only campus management routes
router.post('/', adminAuthMiddleware, createCampus);
router.put('/', adminAuthMiddleware, editCampus);
router.delete('/', adminAuthMiddleware, deleteCampus);

module.exports = router; 