const express = require('express');
const router = express.Router();
const {
  createLesson,
  editLesson,
  deleteLesson,
  listLessonsByModule,
  getLessonById
} = require('../controllers/lessonController');
const { authMiddleware, adminAuthMiddleware } = require('../middlewares/auth');

// Public lesson viewing routes (require user authentication)
router.get('/', authMiddleware, getLessonById);
router.get('/list', authMiddleware, listLessonsByModule);

// Admin-only lesson management routes
router.post('/', adminAuthMiddleware, createLesson);
router.put('/', adminAuthMiddleware, editLesson);
router.delete('/', adminAuthMiddleware, deleteLesson);

module.exports = router; 