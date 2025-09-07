const express = require('express');
const router = express.Router();
const {
  createModule,
  editModule,
  deleteModule,
  listModulesByCourse,
  getModuleById
} = require('../controllers/moduleController');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Public module viewing routes (require user authentication)
router.get('/', authMiddleware, getModuleById);
router.get('/list', authMiddleware, listModulesByCourse);

// Admin-only module management routes
router.post('/', adminAuthMiddleware, createModule);
router.put('/', adminAuthMiddleware, editModule);
router.delete('/', adminAuthMiddleware, deleteModule);

module.exports = router; 