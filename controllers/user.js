// userController.js
const User = require('../models/user');
const Avatar = require('../models/avatar');
const Otp = require('../models/otp-request');
const jwt = require('jsonwebtoken');
const sendEmail = require('../utils/sendEmail');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const signUp = async (req, res) => {
  try {
    const { email, firstName, lastName, phone } = req.body;
    const requiredFields = { email, firstName, lastName, phone };
    
    for (const [field, value] of Object.entries(requiredFields)) {
      if (!value) return errorResponse(res, 400, `${field} field is required`);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 200, `An account with email ${email} already exists`);
    }

    await User.create({ email, firstName, lastName, phone });
    // Auto-send OTP after signup
    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.create({ email, code: otpCode, requestedAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendEmail(
      email,
      'Your One-Time Password (Money Minds)',
      `Hello ${firstName},\n\nYour One-Time Password (OTP) to continue with Money Minds is:\n\n🔐 OTP: ${otpCode}\n\nThis code is valid for 5 minutes. Please do not share it with anyone.\n\nIf you did not request this OTP, please ignore this message.\n\nThank you,  \nThe Money Minds Team`
    );
    return successResponse(res, 201, `Account created for ${email}. OTP has been sent to your email and will expire in 5 minutes.`);
  } catch (err) {
    return errorResponse(res, 500, 'An error occurred while processing your request', err.message);
  }
};

const sendOtp = async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return errorResponse(res, 400, 'Please provide an email address');

    const user = await User.findOne({ email });
    if (!user) {
      return errorResponse(res, 404, 'No account found with this email address');
    }

    const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
    await Otp.create({ email, code: otpCode, requestedAt: Date.now(), expiresAt: Date.now() + 5 * 60 * 1000 });
    await sendEmail(
        email,
        'Your One-Time Password (Money Minds)',
        `Hello ${user.firstName},

Your One-Time Password (OTP) to continue with Money Minds is: ${otpCode}

This code is valid for 5 minutes. Please do not share it with anyone.

If you did not request this OTP, please ignore this message.

Thank you,
The Money Minds Team`
      );
    return successResponse(res, 200, `OTP has been sent to ${email}. It will expire in 5 minutes`);
  } catch (err) {
    return errorResponse(res, 500, 'Failed to generate and send OTP', err.message);
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) return errorResponse(res, 400, 'Both email and OTP are required for verification');

    const validOtp = await Otp.findOne({ email, code: otp });
    if (!validOtp || validOtp.expiresAt < Date.now()) {
      return errorResponse(res, 400, 'The OTP provided is either invalid or has expired');
    }
    await Otp.deleteMany({ email });
    const user = await User.findOne({ email });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
<<<<<<< HEAD
    return res
      .status(200)
      .json({
        status: true,
        message: "OTP verification successful",
        token,
        user
      });
=======
    return res.status(200).json({ status: true, message: 'OTP verification successful', token, firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email, phone: user.phone, avatar: user.avatar });
>>>>>>> cb3ddba (APIs updated)
  } catch (err) {
    return errorResponse(res, 500, 'An error occurred during OTP verification', err.message);
  }
};

const checkUsernameAvailability = async (req, res) => {
  try {
    const { username } = req.query;
    if (!username) return errorResponse(res, 400, 'Please provide a username to check availability');

    const user = await User.findOne({ username });
    return successResponse(res, 200, user ? `Username '${username}' is already taken` : `Username '${username}' is available`);
  } catch (err) {
    return errorResponse(res, 500, 'Failed to check username availability', err.message);
  }
};

const getAvatars = async (req, res) => {
  try {
    const avatars = await Avatar.find({});
    return res.status(200).json({ status: true, message: 'Avatar list retrieved successfully', avatars });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to retrieve avatar list', err.message);
  }
};

const setUsernameAndAvatar = async (req, res) => {
  try {
    const { username, avatarUrl } = req.body;
    if (!username || !avatarUrl) return errorResponse(res, 400, 'Both username and avatar URL are required');

    const user = await User.findById(req.userId);
    if (!user) return errorResponse(res, 404, 'User account not found');

    user.username = username;
    user.avatar = avatarUrl;
    await user.save();
    return successResponse(res, 200, 'Username and avatar have been successfully updated');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update username and avatar', err.message);
  }
};

const modifyAvatar = async (req, res) => {
  try {
    const { avatarUrl } = req.body;
    if (!avatarUrl) return errorResponse(res, 400, 'Please provide an avatar URL');

    const user = await User.findById(req.userId);
    user.avatar = avatarUrl;
    await user.save();
<<<<<<< HEAD
    return res
      .status(200)
      .json({
        status: true,
        message: "Avatar has been successfully updated",
        user,
      });
=======
    return successResponse(res, 200, 'Avatar has been successfully updated', {firstName: user.firstName, lastName: user.lastName, username: user.username, email: user.email, phone: user.phone, avatar: user.avatar});
>>>>>>> cb3ddba (APIs updated)
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update avatar', err.message);
  }
};

const modifyUsername = async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return errorResponse(res, 400, 'Please provide a username');

    const exists = await User.findOne({ username });
    if (exists) return errorResponse(res, 400, 'This username is already taken. Please choose another one');

    const user = await User.findById(req.userId);
    user.username = username;
    await user.save();
    return successResponse(res, 200, 'Username has been successfully updated');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update username', err.message);
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
