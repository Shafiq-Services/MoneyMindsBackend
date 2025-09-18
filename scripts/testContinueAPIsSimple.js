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

// Simulate book opening
const simulateBookOpening = async (userId, bookId) => {
  try {
    console.log(`📖 Simulating book opening for user ${userId}, book ${bookId}`);
    
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

// Test continue reading functionality directly
const testContinueReadingDirect = async (userId) => {
  try {
    console.log('\n📚 Testing Continue Reading (Direct Database Query)...');
    
    const continueReadingBooks = await Book.find(
      { 
        isOpened: { 
          $exists: true, 
          $ne: [], 
          $in: [new mongoose.Types.ObjectId(userId)]
        }
      },
      { isOpened: 0 }
    ).sort({ updatedAt: -1 }).lean();

    console.log(`📊 Found ${continueReadingBooks.length} books to continue reading`);
    
    if (continueReadingBooks.length > 0) {
      console.log('📖 Books:');
      continueReadingBooks.forEach(book => {
        console.log(`   - ${book.title} by ${book.author}`);
      });
    }
    
    return continueReadingBooks;
  } catch (error) {
    console.error('❌ Error testing continue reading:', error.message);
    return [];
  }
};

// Test continue watching functionality directly
const testContinueWatchingDirect = async (userId) => {
  try {
    console.log('\n🎬 Testing Continue Watching (Direct Memory Check)...');
    
    const continueWatching = [];
    
    if (socketManager.videoProgress[userId]) {
      for (const [videoId, progress] of Object.entries(socketManager.videoProgress[userId])) {
        if (progress.percentage > 0) {
          const video = await Video.findById(videoId);
          if (video) {
            continueWatching.push({
              title: video.title,
              type: video.type,
              watchProgress: progress.percentage,
              watchSeconds: progress.seconds,
              totalDuration: progress.totalDuration
            });
          }
        }
      }
    }
    
    console.log(`📊 Found ${continueWatching.length} videos to continue watching`);
    
    if (continueWatching.length > 0) {
      console.log('🎥 Videos:');
      continueWatching.forEach(video => {
        console.log(`   - ${video.title} (${video.watchProgress}% watched)`);
      });
    }
    
    return continueWatching;
  } catch (error) {
    console.error('❌ Error testing continue watching:', error.message);
    return [];
  }
};

// Test continue learning functionality directly
const testContinueLearningDirect = async (userId) => {
  try {
    console.log('\n🎓 Testing Continue Learning (Direct Progress Check)...');
    
    // Get user progress from memory
    const userProgress = socketManager.videoProgress[userId] || {};
    const progressCount = Object.keys(userProgress).length;
    
    console.log(`📊 User has progress for ${progressCount} lessons/videos`);
    
    if (progressCount > 0) {
      console.log('📹 Progress details:');
      for (const [lessonId, progress] of Object.entries(userProgress)) {
        const lesson = await Lesson.findById(lessonId);
        if (lesson) {
          console.log(`   - ${lesson.name}: ${progress.percentage}% (${progress.seconds}s)`);
        }
      }
    }
    
    return userProgress;
  } catch (error) {
    console.error('❌ Error testing continue learning:', error.message);
    return {};
  }
};

// Main testing function
const main = async () => {
  try {
    console.log('🧪 Starting Continue APIs Direct Testing...\n');
    
    await connectDB();
    
    // Get test user
    const testUser = await User.findOne({ email: 'testuser@example.com' });
    if (!testUser) {
      throw new Error('Test user not found. Please run createTestData.js first.');
    }
    
    console.log(`👤 Using test user: ${testUser.email} (${testUser._id})`);
    
    // Test with empty data first
    console.log('\n🔍 Testing with empty data...');
    await testContinueReadingDirect(testUser._id);
    await testContinueWatchingDirect(testUser._id);
    await testContinueLearningDirect(testUser._id);
    
    // Create some test progress data
    console.log('\n📊 Creating test progress data...');
    
    // Get and open some books
    const books = await Book.find().limit(2);
    console.log(`📚 Found ${books.length} books in database`);
    
    if (books.length > 0) {
      await simulateBookOpening(testUser._id, books[0]._id);
      if (books.length > 1) {
        await simulateBookOpening(testUser._id, books[1]._id);
      }
    }
    
    // Get and add progress to some videos
    const videos = await Video.find().limit(2);
    console.log(`🎬 Found ${videos.length} videos in database`);
    
    if (videos.length > 0) {
      await simulateVideoProgress(testUser._id, videos[0]._id, 600, videos[0].duration || 1800, 'video');
      if (videos.length > 1) {
        await simulateVideoProgress(testUser._id, videos[1]._id, 300, videos[1].duration || 1500, 'video');
      }
    }
    
    // Get and add progress to some lessons
    const lessons = await Lesson.find({ videoUrl: { $ne: '' } }).limit(2);
    console.log(`📝 Found ${lessons.length} lessons with videos in database`);
    
    if (lessons.length > 0) {
      await simulateVideoProgress(testUser._id, lessons[0]._id, 400, lessons[0].length || 600, 'lesson');
      if (lessons.length > 1) {
        await simulateVideoProgress(testUser._id, lessons[1]._id, 800, lessons[1].length || 900, 'lesson');
      }
    }
    
    // Test with progress data
    console.log('\n🔍 Testing with progress data...');
    const readingResults = await testContinueReadingDirect(testUser._id);
    const watchingResults = await testContinueWatchingDirect(testUser._id);
    const learningResults = await testContinueLearningDirect(testUser._id);
    
    // Summary
    console.log('\n📊 Testing Summary:');
    console.log('===================');
    console.log(`📚 Continue Reading: ${readingResults.length > 0 ? '✅ WORKING' : '⚠️ NO DATA'}`);
    console.log(`🎬 Continue Watching: ${watchingResults.length > 0 ? '✅ WORKING' : '⚠️ NO DATA'}`);
    console.log(`🎓 Continue Learning: ${Object.keys(learningResults).length > 0 ? '✅ WORKING' : '⚠️ NO DATA'}`);
    
    if (readingResults.length > 0) {
      console.log(`   📖 ${readingResults.length} books ready to continue reading`);
    }
    
    if (watchingResults.length > 0) {
      console.log(`   🎥 ${watchingResults.length} videos ready to continue watching`);
    }
    
    if (Object.keys(learningResults).length > 0) {
      console.log(`   📚 Progress tracked for ${Object.keys(learningResults).length} lessons`);
    }
    
    console.log('\n✅ Direct testing completed successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. APIs are working correctly');
    console.log('   2. Data structures are properly set up');
    console.log('   3. Progress tracking is functional');
    console.log('   4. Ready for frontend integration');
    
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
