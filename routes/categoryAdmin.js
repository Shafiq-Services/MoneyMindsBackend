const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middlewares/auth');

// Controllers
const {
  getAllCategories,
  createCategory,
  updateCategoryById,
  deleteCategoryById
} = require('../controllers/categoryAdminController');

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Category Management Routes
router.get('/list', getAllCategories);
router.post('/create', createCategory);
router.put('/update', updateCategoryById);
router.delete('/delete', deleteCategoryById);

module.exports = router;
