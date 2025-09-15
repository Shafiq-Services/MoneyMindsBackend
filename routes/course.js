const express = require('express');
const router = express.Router();
const {
  createCourse,
  editCourse,
  deleteCourse,
  listCoursesByCampus,
  getCourseById,
  getContinueLearning,
  getAllCoursesAdmin,
  getCourseByIdAdmin
} = require('../controllers/courseController');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Public course viewing routes (require user authentication)
router.get('/', authMiddleware, getCourseById);
router.get('/list', authMiddleware, listCoursesByCampus);
router.get('/continue-learning', authMiddleware, getContinueLearning);

// Admin-only course management routes
router.post('/', adminAuthMiddleware, createCourse);
router.put('/', adminAuthMiddleware, editCourse);
router.delete('/', adminAuthMiddleware, deleteCourse);

// Admin APIs
router.get('/admin/all', adminAuthMiddleware, getAllCoursesAdmin);
router.get('/admin/get', adminAuthMiddleware, getCourseByIdAdmin);

module.exports = router; 