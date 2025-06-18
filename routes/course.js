const express = require('express');
const router = express.Router();
const {
  createCourse,
  editCourse,
  deleteCourse,
  listCoursesByCampus,
  getCourseById
} = require('../controllers/courseController');
const authMiddleware = require('../middlewares/auth');
router.use(authMiddleware);

// All course routes require authentication
router.get('/', getCourseById);
router.get('/list', listCoursesByCampus);
//Admin Routes
router.post('/', createCourse);
router.put('/', editCourse);
router.delete('/', deleteCourse);

module.exports = router; 