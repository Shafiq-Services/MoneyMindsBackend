const express = require('express');
const router = express.Router();
const {
  createLesson,
  editLesson,
  deleteLesson,
  listLessonsByModule,
  getLessonById
} = require('../controllers/lessonController');
const authMiddleware = require('../middlewares/auth');
router.use(authMiddleware);

// All lesson routes require authentication
router.get('/', getLessonById);
router.get('/list', listLessonsByModule);
//Admin Routes
router.post('/', createLesson);
router.put('/', editLesson);
router.delete('/', deleteLesson);

module.exports = router; 