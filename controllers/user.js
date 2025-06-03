// userController.js
const User = require('../models/user');
const Avatar = require('../models/avatar');
const Otp = require('../models/otp-request');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');

const signUp = async (req, res) => {
  try {
    const { email, firstName, lastName, phone } = req.body;
    const requiredFields = { email, firstName, lastName, phone };
    
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) return res.status(400).json({ status: false, message: `${field} field is required` });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(200).json({ status: false, message: `An account with email ${email} already exists` });
    }

    await User.create({ email, firstName, lastName, phone });
    return res.status(201).json({ status: true, message: `Account successfully created for ${email}` });

  } catch (err) {
    return res.status(500).json({ status: false, message: 'An error occurred while processing your request', error: err.message });
  }
};

const sendOtp = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ status: false, message: 'Please provide an email address' });

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ status: false, message: 'No account found with this email address' });
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.create({ email, code: otpCode, requestedAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendEmail(
        email,
        'Your One-Time Password (Money Minds)',
        `
      Hello ${user.firstName},
      
      Your One-Time Password (OTP) to continue with Money Minds is:
      
      🔐 OTP: ${otpCode}
      
      This code is valid for 5 minutes. Please do not share it with anyone.
      
      If you did not request this OTP, please ignore this message.
      
      Thank you,  
      The Money Minds Team
        `.trim()
      );
    return res.status(200).json({ status: true, message: `OTP has been sent to ${email}. It will expire in 5 minutes` });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to generate and send OTP', error: err.message });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return res.status(400).json({ status: false, message: 'Both email and OTP are required for verification' });

    const validOtp = await Otp.findOne({ email, code: otp });
    if (!validOtp || validOtp.expiresAt < Date.now()) {
      return res.status(400).json({ status: false, message: 'The OTP provided is either invalid or has expired' });
    }
    await Otp.deleteMany({ email });
    const user = await User.findOne({ email });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    return res.status(200).json({ status: true, message: 'OTP verification successful', token });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'An error occurred during OTP verification', error: err.message });
  }
};

const checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return res.status(400).json({ status: false, message: 'Please provide a username to check availability' });

    const user = await User.findOne({ username });
    return res.status(200).json({ status: true, message: user ? `Username '${username}' is already taken` : `Username '${username}' is available` });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to check username availability', error: err.message });
  }
};

const getAvatars = async (req, res) => {
  try {
    const avatars = await Avatar.find({});
    return res.status(200).json({ status: true, message: 'Avatar list retrieved successfully', avatars });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to retrieve avatar list', error: err.message });
  }
};

const setUsernameAndAvatar = async (req, res) => {
  try {
    const { username, avatarUrl } = req.body;
    if (!username || !avatarUrl) return res.status(400).json({ status: false, message: 'Both username and avatar URL are required' });

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ status: false, message: 'User account not found' });

    user.username = username;
    user.avatar = avatarUrl;
    await user.save();
    return res.status(200).json({ status: true, message: 'Username and avatar have been successfully updated' });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to update username and avatar', error: err.message });
  }
};

const modifyAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    if (!avatarUrl) return res.status(400).json({ status: false, message: 'Please provide an avatar URL' });

    const user = await User.findById(req.userId);
    user.avatar = avatarUrl;
    await user.save();
    return res.status(200).json({ status: true, message: 'Avatar has been successfully updated' });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to update avatar', error: err.message });
  }
};

const modifyUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ status: false, message: 'Please provide a username' });

    const exists = await User.findOne({ username });
    if (exists) return res.status(400).json({ status: false, message: 'This username is already taken. Please choose another one' });

    const user = await User.findById(req.userId);
    user.username = username;
    await user.save();
    return res.status(200).json({ status: true, message: 'Username has been successfully updated' });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to update username', error: err.message });
  }
};

module.exports = {
  signUp,
  sendOtp,
  verifyOtp,
  checkUsernameAvailability,
  getAvatars,
  setUsernameAndAvatar,
  modifyAvatar,
  modifyUsername,
};