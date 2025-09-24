require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/config');
const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Book = require('../models/book');
const Video = require('../models/video');
const Lesson = require('../models/lesson');
const WatchProgress = require('../models/watchProgress');
const socketManager = require('../utils/socketManager');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log('✅ MongoDB connected for testing');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// Create JWT token for test user
const createTestToken = (userId) => {
  return jwt.sign(
    { id: userId, role: 'user' },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
};

// Test API endpoint
const testAPI = async (endpoint, token, method = 'GET', body = null) => {
  const fetch = require('node-fetch');
  const baseUrl = 'http://localhost:3001';
  
  try {
    const options = {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${baseUrl}${endpoint}`, options);
    const data = await response.json();
    
    return {
      status: response.status,
      success: response.ok,
      data
    };
  } catch (error) {
    console.error(`❌ Error testing ${endpoint}:`, error.message);
    return {
      status: 500,
      success: false,
      error: error.message
    };
  }
};

// Simulate book opening
const simulateBookOpening = async (userId, bookId) => {
  try {
    console.log(`📖 Simulating book opening for user ${userId}, book ${bookId}`);
    
    // Add user to book's isOpened array (simulating socket event)
    const book = await Book.findById(bookId);
    if (!book) {
      throw new Error('Book not found');
    }
    
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const isAlreadyOpened = book.isOpened.some(id => id.equals(userObjectId));
    
    if (!isAlreadyOpened) {
      book.isOpened.push(userObjectId);
      await book.save();
      console.log(`✅ User ${userId} added to book "${book.title}" isOpened array`);
    } else {
      console.log(`⚠️ User ${userId} already in book "${book.title}" isOpened array`);
    }
    
    return book;
  } catch (error) {
    console.error('❌ Error simulating book opening:', error.message);
    throw error;
  }
};

// Simulate video progress
const simulateVideoProgress = async (userId, videoId, progressSeconds, totalDuration, contentType = 'video') => {
  try {
    console.log(`🎬 Simulating video progress: ${progressSeconds}/${totalDuration}s for ${contentType} ${videoId}`);
    
    const progressPercentage = totalDuration > 0 ? Math.round((progressSeconds / totalDuration) * 100) : 0;
    const progressData = {
      seconds: progressSeconds,
      percentage: progressPercentage,
      totalDuration: totalDuration,
      lastUpdated: Date.now()
    };
    
    // Store in memory (simulating socket manager)
    if (!socketManager.videoProgress[userId]) {
      socketManager.videoProgress[userId] = {};
    }
    socketManager.videoProgress[userId][videoId] = progressData;
    
    // Store in database
    await WatchProgress.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        videoId: new mongoose.Types.ObjectId(videoId)
      },
      {
        contentType: contentType,
        seconds: progressSeconds,
        percentage: progressPercentage,
        totalDuration: totalDuration,
        isCompleted: progressPercentage >= 95,
        lastUpdated: new Date()
      },
      { upsert: true, new: true }
    );
    
    console.log(`✅ Progress saved: ${progressPercentage}% for ${contentType} ${videoId}`);
    return progressData;
  } catch (error) {
    console.error('❌ Error simulating video progress:', error.message);
    throw error;
  }
};

// Test continue reading API
const testContinueReading = async (token) => {
  console.log('\n📚 Testing Continue Reading API...');
  
  const response = await testAPI('/api/book/continue-reading', token);
  
  console.log(`Status: ${response.status}`);
  console.log(`Success: ${response.success}`);
  console.log(`Books found: ${response.data.continueReading?.length || 0}`);
  
  if (response.data.continueReading && response.data.continueReading.length > 0) {
    console.log('📖 Books:');
    response.data.continueReading.forEach(book => {
      console.log(`   - ${book.title} by ${book.author}`);
    });
  }
  
  return response;
};

// Test continue learning API
const testContinueLearning = async (token) => {
  console.log('\n🎓 Testing Continue Learning API...');
  
  const response = await testAPI('/api/course/continue-learning', token);
  
  console.log(`Status: ${response.status}`);
  console.log(`Success: ${response.success}`);
  console.log(`Courses found: ${response.data.continueLearning?.continueLearning?.length || 0}`);
  
  if (response.data.continueLearning?.continueLearning && response.data.continueLearning.continueLearning.length > 0) {
    console.log('📚 Courses:');
    response.data.continueLearning.continueLearning.forEach(course => {
      console.log(`   - ${course.title} (${course.courseProgress}% complete)`);
    });
  }
  
  return response;
};

// Test continue watching API
const testContinueWatching = async (token) => {
  console.log('\n🎬 Testing Continue Watching API...');
  
  const response = await testAPI('/api/video/continue-watching', token);
  
  console.log(`Status: ${response.status}`);
  console.log(`Success: ${response.success}`);
  console.log(`Videos found: ${response.data.continueWatching?.length || 0}`);
  
  if (response.data.continueWatching && response.data.continueWatching.length > 0) {
    console.log('🎥 Videos:');
    response.data.continueWatching.forEach(video => {
      console.log(`   - ${video.title} (${video.watchProgress}% watched)`);
    });
  }
  
  return response;
};

// Main testing function
const main = async () => {
  try {
    console.log('🧪 Starting Continue APIs Testing...\n');
    
    await connectDB();
    
    // Get test user
    const testUser = await User.findOne({ email: 'testuser@example.com' });
    if (!testUser) {
      throw new Error('Test user not found. Please run createTestData.js first.');
    }
    
    const token = createTestToken(testUser._id);
    console.log(`👤 Using test user: ${testUser.email} (${testUser._id})`);
    
    // Test APIs with empty data first
    console.log('\n🔍 Testing APIs with empty data...');
    await testContinueReading(token);
    await testContinueLearning(token);
    await testContinueWatching(token);
    
    // Create some test progress data
    console.log('\n📊 Creating test progress data...');
    
    // Get test books and simulate opening some
    const books = await Book.find().limit(2);
    if (books.length > 0) {
      await simulateBookOpening(testUser._id, books[0]._id);
      if (books.length > 1) {
        await simulateBookOpening(testUser._id, books[1]._id);
      }
    }
    
    // Get test videos and simulate progress
    const videos = await Video.find().limit(2);
    if (videos.length > 0) {
      await simulateVideoProgress(testUser._id, videos[0]._id, 600, videos[0].duration || 1800, 'video');
      if (videos.length > 1) {
        await simulateVideoProgress(testUser._id, videos[1]._id, 300, videos[1].duration || 1500, 'video');
      }
    }
    
    // Get test lessons and simulate progress
    const lessons = await Lesson.find({ videoUrl: { $ne: '' } }).limit(2);
    if (lessons.length > 0) {
      await simulateVideoProgress(testUser._id, lessons[0]._id, 400, lessons[0].length || 600, 'lesson');
      if (lessons.length > 1) {
        await simulateVideoProgress(testUser._id, lessons[1]._id, 800, lessons[1].length || 900, 'lesson');
      }
    }
    
    // Test APIs with data
    console.log('\n🔍 Testing APIs with progress data...');
    const readingResult = await testContinueReading(token);
    const learningResult = await testContinueLearning(token);
    const watchingResult = await testContinueWatching(token);
    
    // Summary
    console.log('\n📊 Testing Summary:');
    console.log('===================');
    console.log(`📚 Continue Reading: ${readingResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`🎓 Continue Learning: ${learningResult.success ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`🎬 Continue Watching: ${watchingResult.success ? '✅ PASS' : '❌ FAIL'}`);
    
    if (readingResult.data.continueReading?.length > 0) {
      console.log(`   📖 Found ${readingResult.data.continueReading.length} books to continue reading`);
    }
    
    if (learningResult.data.continueLearning?.continueLearning?.length > 0) {
      console.log(`   📚 Found ${learningResult.data.continueLearning.continueLearning.length} courses to continue learning`);
    }
    
    if (watchingResult.data.continueWatching?.length > 0) {
      console.log(`   🎥 Found ${watchingResult.data.continueWatching.length} videos to continue watching`);
    }
    
    console.log('\n🎉 Testing completed successfully!');
    
  } catch (error) {
    console.error('❌ Testing failed:', error.message);
  } finally {
    await mongoose.connection.close();
    console.log('\n🔌 Database connection closed');
    process.exit(0);
  }
};

// Run the tests
main();
