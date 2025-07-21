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
  modifyBio,
  modifyCountry,
  getUserProfile,
  editUserProfile
} = require('../controllers/user');
const authMiddleware = require('../middlewares/auth');

// Public routes
router.post('/signup', signUp);
router.post('/send-otp', sendOtp);
router.post('/verify-otp', verifyOtp);

// Protected routes
router.use(authMiddleware);
router.get('/username-available', checkUsernameAvailability);
router.get('/avatars', getAvatars);
router.get('/profile', getUserProfile);
router.put('/edit-profile', editUserProfile);
router.put('/set-username-avatar', setUsernameAndAvatar);
router.put('/modify-avatar', modifyAvatar);
router.put('/modify-username', modifyUsername);
router.put('/modify-bio', modifyBio);
router.put('/modify-country', modifyCountry);

module.exports = router;