/**
 * Migration script to set up Money Minds campus structure
 * This script will:
 * 1. Create Money Minds campus if it doesn't exist (virtual campus)
 * 2. Create Money Minds channel in the Money Minds campus
 * 3. Remove old platform channels
 * 4. Clean up existing users from Money Minds campus (make it virtual)
 */

const mongoose = require('mongoose');
const Campus = require('../models/campus');
const Channel = require('../models/channel');
const ChatCategory = require('../models/chat-category');
const User = require('../models/user');
const connectDB = require('../config/db');

async function migrateToMoneyMindsCampus() {
  try {
    console.log('🚀 Starting Money Minds virtual campus migration...');
    
    // Connect to database
    await connectDB();
    
    // Step 1: Create or find Money Minds campus
    let moneyMindsCampus = await Campus.findOne({ isMoneyMindsCampus: true });
    
    if (!moneyMindsCampus) {
      console.log('📍 Creating Money Minds virtual campus...');
      moneyMindsCampus = await Campus.create({
        slug: 'money-minds',
        title: 'Money Minds',
        imageUrl: '',
        mainIconUrl: '',
        campusIconUrl: '',
        isMoneyMindsCampus: true,
        members: [] // Virtual campus with no members
      });
      console.log('✅ Money Minds virtual campus created successfully');
    } else {
      console.log('✅ Money Minds campus already exists');
      
      // Clear existing members to make it virtual
      if (moneyMindsCampus.members.length > 0) {
        console.log(`📍 Clearing ${moneyMindsCampus.members.length} members from Money Minds campus to make it virtual...`);
        moneyMindsCampus.members = [];
        await moneyMindsCampus.save();
        console.log('✅ Money Minds campus is now virtual (no members)');
      }
    }
    
    // Step 2: Create GENERAL category if it doesn't exist
    let generalCategory = await ChatCategory.findOne({ slug: 'GENERAL' });
    if (!generalCategory) {
      console.log('📍 Creating GENERAL category...');
      generalCategory = await ChatCategory.create({ slug: 'GENERAL' });
      console.log('✅ GENERAL category created successfully');
    } else {
      console.log('✅ GENERAL category already exists');
    }
    
    // Step 3: Create Money Minds channel in Money Minds campus
    let moneyMindsChannel = await Channel.findOne({ 
      name: 'Money Minds',
      campusId: moneyMindsCampus._id
    });
    
    if (!moneyMindsChannel) {
      console.log('📍 Creating Money Minds channel in Money Minds campus...');
      
      // Check if there's already a channel with the same slug
      const existingChannel = await Channel.findOne({ slug: 'money-minds' });
      if (existingChannel) {
        console.log('📍 Found existing channel with slug "money-minds", removing it...');
        await Channel.deleteOne({ _id: existingChannel._id });
        console.log('✅ Removed existing conflicting channel');
      }
      
      moneyMindsChannel = await Channel.create({
        name: 'Money Minds',
        slug: 'money-minds',
        campusId: moneyMindsCampus._id,
        category: generalCategory._id,
        isPlatformChannel: false
      });
      console.log('✅ Money Minds channel created successfully');
    } else {
      console.log('✅ Money Minds channel already exists in Money Minds campus');
    }
    
    // Step 4: Remove old platform channels
    console.log('📍 Removing old platform channels...');
    const platformChannels = await Channel.find({ isPlatformChannel: true });
    
    if (platformChannels.length > 0) {
      console.log(`Found ${platformChannels.length} platform channels to remove`);
      await Channel.deleteMany({ isPlatformChannel: true });
      console.log('✅ Removed old platform channels');
    } else {
      console.log('✅ No platform channels to remove');
    }
    
    // Step 5: Update any remaining isPlatformChannel flags to false
    console.log('📍 Updating isPlatformChannel flags...');
    const result = await Channel.updateMany(
      { isPlatformChannel: true },
      { $set: { isPlatformChannel: false } }
    );
    
    if (result.modifiedCount > 0) {
      console.log(`✅ Updated ${result.modifiedCount} channels to remove platform flag`);
    } else {
      console.log('✅ No platform flags to update');
    }
    
    console.log('🎉 Migration completed successfully!');
    console.log('📊 Money Minds campus is now virtual and accessible to all users');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    // Close database connection
    await mongoose.connection.close();
  }
}

// Run migration if called directly
if (require.main === module) {
  migrateToMoneyMindsCampus()
    .then(() => {
      console.log('✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Migration script failed:', error);
      process.exit(1);
    });
}

module.exports = migrateToMoneyMindsCampus; 