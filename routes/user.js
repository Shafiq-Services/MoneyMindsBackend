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
router.get('/set-username-avatar', setUsernameAndAvatar);
router.get('/modify-avatar', modifyAvatar);
router.get('/modify-username', modifyUsername);

module.exports = router;