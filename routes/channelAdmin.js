const express = require('express');
const router = express.Router();
const { adminAuthMiddleware } = require('../middlewares/auth');

// Controllers
const {
  getAllChannels,
  createChannel,
  updateChannelById,
  deleteChannelById
} = require('../controllers/channelAdminController');

// All routes require admin authentication
router.use(adminAuthMiddleware);

// Channel Management Routes
router.get('/list', getAllChannels);
router.post('/create', createChannel);
router.put('/update', updateChannelById);
router.delete('/delete', deleteChannelById);

module.exports = router;
