const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/auth');
const channelController = require('../controllers/channelController');

router.use(authMiddleware);

// Channel endpoints
router.post('/channel/add', channelController.addChannel);
router.get('/channel/list', channelController.listChannels);
router.post('/channel/message', channelController.sendMessage);
router.put('/channel/message/edit', channelController.editMessage);
router.delete('/channel/message/delete', channelController.deleteMessage);
router.get('/channel/members', channelController.getChannelMembers);
router.get('/channel/messages', channelController.getChannelMessages);

module.exports = router;
