const mongoose = require('mongoose');
const config = require('../config/config');
const User = require('../models/user');
const Subscription = require('../models/subscription');

/**
 * Script to mark a user as paid by creating/updating their subscription
 * Usage: node scripts/markUserAsPaid.js <userEmail>
 * Or: node scripts/markUserAsPaid.js (will prompt for email)
 */

const markUserAsPaid = async (userEmail) => {
  try {
    // Connect to MongoDB
    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(config.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected successfully\n');

    // Find user by email
    console.log(`🔍 Looking for user with email: ${userEmail}`);
    const user = await User.findOne({ email: userEmail });
    
    if (!user) {
      console.error(`❌ User with email "${userEmail}" not found`);
      process.exit(1);
    }

    console.log(`✅ Found user: ${user.firstName} ${user.lastName} (${user.email})`);
    console.log(`   User ID: ${user._id}\n`);

    // Check if user already has a subscription
    const existingSubscription = await Subscription.findOne({
      userId: user._id
    }).sort({ createdAt: -1 });

    // Calculate currentPeriodEnd (1 month from now)
    const currentPeriodEnd = new Date();
    currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);

    if (existingSubscription) {
      // Update existing subscription
      console.log('📝 Updating existing subscription...');
      existingSubscription.status = 'active';
      existingSubscription.plan = existingSubscription.plan || 'monthly';
      existingSubscription.currentPeriodEnd = currentPeriodEnd;
      existingSubscription.cancelAtPeriodEnd = false;
      existingSubscription.provider = existingSubscription.provider || 'stripe';
      await existingSubscription.save();
      
      console.log('✅ Subscription updated successfully!');
      console.log(`   Status: ${existingSubscription.status}`);
      console.log(`   Plan: ${existingSubscription.plan}`);
      console.log(`   Current Period End: ${existingSubscription.currentPeriodEnd.toLocaleDateString()}`);
    } else {
      // Create new subscription
      console.log('📝 Creating new subscription...');
      const newSubscription = new Subscription({
        userId: user._id,
        plan: 'monthly',
        provider: 'stripe',
        status: 'active',
        currentPeriodEnd: currentPeriodEnd,
        recurring: true,
        cancelAtPeriodEnd: false,
        metadata: {
          createdBy: 'admin-script',
          createdAt: new Date()
        }
      });
      
      await newSubscription.save();
      
      console.log('✅ Subscription created successfully!');
      console.log(`   Status: ${newSubscription.status}`);
      console.log(`   Plan: ${newSubscription.plan}`);
      console.log(`   Current Period End: ${newSubscription.currentPeriodEnd.toLocaleDateString()}`);
      console.log(`   Subscription ID: ${newSubscription._id}`);
    }

    console.log('\n🎉 User is now marked as paid!');
    console.log('   The user can now access all protected routes.');
    console.log('   Note: The frontend may need to refresh or re-login to update the isPaid flag.');

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

// Get email from command line argument or prompt
const userEmail = process.argv[2];

if (!userEmail) {
  console.log('📧 Please provide user email as argument:');
  console.log('   node scripts/markUserAsPaid.js <userEmail>');
  console.log('\nExample:');
  console.log('   node scripts/markUserAsPaid.js user@example.com');
  process.exit(1);
}

// Run the script
markUserAsPaid(userEmail);
