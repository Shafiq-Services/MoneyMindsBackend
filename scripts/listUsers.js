const mongoose = require('mongoose');
const config = require('../config/config');
const User = require('../models/user');

/**
 * Script to list all users in the database
 * Usage: node scripts/listUsers.js
 */

const listUsers = async () => {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected successfully\n');

    // Find all users
    const users = await User.find({}).select('email firstName lastName username createdAt').sort({ createdAt: -1 });
    
    if (users.length === 0) {
      console.log('📭 No users found in database');
    } else {
      console.log(`📋 Found ${users.length} user(s):\n`);
      console.log('─'.repeat(80));
      users.forEach((user, index) => {
        console.log(`${index + 1}. Email: ${user.email}`);
        console.log(`   Name: ${user.firstName || 'N/A'} ${user.lastName || 'N/A'}`);
        console.log(`   Username: ${user.username || 'N/A'}`);
        console.log(`   Created: ${user.createdAt.toLocaleDateString()}`);
        console.log('─'.repeat(80));
      });
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    // Close MongoDB connection
    await mongoose.connection.close();
    console.log('\n🔌 MongoDB connection closed');
    process.exit(0);
  }
};

// Run the script
listUsers();
