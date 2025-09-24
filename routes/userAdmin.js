const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middlewares/auth');

// Controllers
const {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  getUserStats
} = require('../controllers/userAdminController');

// All routes require admin authentication
router.use(adminAuthMiddleware);

// User Management Routes
router.get('/list', getAllUsers);
router.get('/get', getUserById);
router.post('/add', createUser);
router.put('/edit', updateUser);
router.delete('/delete', deleteUser);
router.put('/status', updateUserStatus);
router.put('/role', updateUserRole);
router.get('/stats', getUserStats);

module.exports = router;
