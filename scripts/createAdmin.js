const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('../models/user');
const config = require('../config/config');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    console.log('✅ MongoDB connected for admin creation');
  } catch (error) {
    console.error('❌ MongoDB connection error:', error.message);
    process.exit(1);
  }
};

// Create initial admin
const createAdmin = async () => {
  try {
    // Admin credentials
    const adminData = {
      email: 'admin@moneyminds.com',
      firstName: 'Money',
      lastName: 'Minds Admin',
      phone: '+1234567890',
      username: 'admin',
      role: 'admin',
      isActive: true,
      password: 'MoneyMinds@2024!', // Strong default password
      bio: 'System Administrator',
      country: 'United States'
    };

    // Check if admin already exists
    const existingAdmin = await User.findOne({ email: adminData.email });
    if (existingAdmin) {
      console.log('⚠️  Admin user already exists with email:', adminData.email);
      if (existingAdmin.role !== 'admin') {
        console.log('🔄 Updating existing user to admin role...');
        existingAdmin.role = 'admin';
        existingAdmin.password = await bcrypt.hash(adminData.password, 10);
        existingAdmin.isActive = true;
        await existingAdmin.save();
        console.log('✅ Existing user updated to admin successfully');
      }
      return existingAdmin;
    }

    // Hash the password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(adminData.password, saltRounds);
    adminData.password = hashedPassword;

    // Create the admin user
    const admin = await User.create(adminData);
    console.log('✅ Admin user created successfully');
    
    return admin;
  } catch (error) {
    console.error('❌ Error creating admin:', error.message);
    throw error;
  }
};

// Main execution function
const main = async () => {
  try {
    console.log('🚀 Starting admin creation process...');
    
    await connectDB();
    const admin = await createAdmin();
    
    console.log('\n🎉 Admin Creation Complete!');
    console.log('📧 Email:', admin.email);
    console.log('🔑 Password: MoneyMinds@2024!');
    console.log('👤 Role:', admin.role);
    console.log('🆔 ID:', admin._id);
    
    console.log('\n📝 Admin Login Instructions:');
    console.log('1. Use POST /api/user/admin-login');
    console.log('2. Send JSON: { "email": "admin@moneyminds.com", "password": "MoneyMinds@2024!" }');
    console.log('3. Use the returned token for admin API calls');
    
    console.log('\n🔒 Security Reminder:');
    console.log('- Change the admin password after first login');
    console.log('- Store credentials securely');
    console.log('- Use admin token only for admin operations');
    
  } catch (error) {
    console.error('❌ Script failed:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the script
main();
