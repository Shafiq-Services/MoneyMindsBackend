const express = require('express');
const router = express.Router();
const {
  createModule,
  editModule,
  deleteModule,
  listModulesByCourse,
  getModuleById
} = require('../controllers/moduleController');
const authMiddleware = require('../middlewares/auth');
router.use(authMiddleware);

// All module routes require authentication
router.get('/', getModuleById);
router.get('/list', listModulesByCourse);
//Admin Routes
router.post('/', createModule);
router.put('/', editModule);
router.delete('/', deleteModule);

module.exports = router; 