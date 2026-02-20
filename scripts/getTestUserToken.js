const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/user');

/**
 * Get a valid JWT for a logged-in user (for frontend/testing).
 * Usage: node scripts/getTestUserToken.js
 *        node scripts/getTestUserToken.js <email>
 *
 * Prints user info and a token you can set in the browser:
 *   localStorage.setItem('token', '<TOKEN>');
 *   sessionStorage.setItem('token', '<TOKEN>');
 */

const getTestUserToken = async () => {
  try {
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('✅ MongoDB connected\n');

    const emailArg = process.argv[2];
    let user;

    if (emailArg) {
      user = await User.findOne({ email: emailArg }).lean();
      if (!user) {
        console.error(`❌ User with email "${emailArg}" not found.`);
        process.exit(1);
      }
    } else {
      user = await User.findOne().sort({ createdAt: -1 }).lean();
      if (!user) {
        console.error('❌ No users in database. Sign up via the app first.');
        process.exit(1);
      }
      console.log('📌 No email provided — using most recently created user.\n');
    }

    if (!process.env.JWT_SECRET) {
      console.error('❌ JWT_SECRET is not set in .env');
      process.exit(1);
    }

    const token = jwt.sign(
      { id: user._id, role: user.role || 'user' },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    console.log('👤 User:');
    console.log('   Email:    ', user.email);
    console.log('   Name:     ', [user.firstName, user.lastName].filter(Boolean).join(' ') || '(not set)');
    console.log('   Username: ', user.username || '(not set)');
    console.log('   ID:       ', user._id);
    console.log('');
    console.log('🔑 Token (valid 7 days):');
    console.log(token);
    console.log('');
    console.log('📋 Use in browser (DevTools → Console or Application → Local Storage):');
    console.log("   localStorage.setItem('token', '" + token.substring(0, 30) + "...');");
    console.log("   sessionStorage.setItem('token', '" + token.substring(0, 30) + "...');");
    console.log('');
    console.log('   Then refresh the app to continue testing.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    console.log('🔌 MongoDB connection closed');
    process.exit(0);
  }
};

getTestUserToken();
