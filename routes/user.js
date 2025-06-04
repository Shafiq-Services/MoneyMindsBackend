// user.js (Express Routes)
const express = require('express');
const router = express.Router();
const {
  signUp,
  sendOtp,
  verifyOtp,
  checkUsernameAvailability,
  getAvatars,
  setUsernameAndAvatar,
  modifyAvatar,
  modifyUsername,
} = require('../controllers/user');
const authMiddleware = require('../middlewares/auth');

router.post('/signup', signUp);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);
router.use(authMiddleware);
router.get('/username-available', checkUsernameAvailability);
router.get('/avatars', getAvatars);
router.put('/set-username-avatar', setUsernameAndAvatar);
router.put('/modify-avatar', modifyAvatar);
router.put('/modify-username', modifyUsername);

module.exports = router;