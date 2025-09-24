const express = require('express');
const router = express.Router();
const {
  createModule,
  editModule,
  deleteModule,
  listModulesByCourse,
  getModuleById,
  getAllModulesAdmin,
  getModuleByIdAdmin,
  getCourseModulesAdmin
} = require('../controllers/moduleController');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Public module viewing routes (require user authentication)
router.get('/', authMiddleware, getModuleById);
router.get('/list', authMiddleware, listModulesByCourse);

// Admin-only module management routes
router.post('/', adminAuthMiddleware, createModule);
router.put('/', adminAuthMiddleware, editModule);
router.delete('/', adminAuthMiddleware, deleteModule);

// Admin APIs
router.get('/admin/all', adminAuthMiddleware, getAllModulesAdmin);
router.get('/admin/get', adminAuthMiddleware, getModuleByIdAdmin);
router.get('/admin/course-modules', adminAuthMiddleware, getCourseModulesAdmin);

module.exports = router; 