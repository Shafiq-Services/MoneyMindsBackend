require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/config');
const User = require('../models/user');
const Book = require('../models/book');
const Campus = require('../models/campus');
const Course = require('../models/course');
const Module = require('../models/module');
const Lesson = require('../models/lesson');
const Video = require('../models/video');
const Series = require('../models/series');
const WatchProgress = require('../models/watchProgress');

// Connect to MongoDB
const connectDB = async () => {
  try {
    await mongoose.connect(config.MONGO_URI);
    console.log('✅ MongoDB connected for test data creation');
  } catch (err) {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  }
};

// Create test user
const createTestUser = async () => {
  try {
    const existingUser = await User.findOne({ email: 'testuser@example.com' });
    if (existingUser) {
      console.log('📧 Test user already exists:', existingUser.email);
      return existingUser;
    }

    const testUser = await User.create({
      email: 'testuser@example.com',
      firstName: 'Test',
      lastName: 'User',
      phone: '+1234567890',
      username: 'testuser',
      emailVerified: true,
      profileCompleted: true,
      isActive: true,
      bio: 'Test user for API testing',
      country: 'United States'
    });

    console.log('✅ Test user created:', testUser.email);
    return testUser;
  } catch (error) {
    console.error('❌ Error creating test user:', error.message);
    throw error;
  }
};

// Create test books
const createTestBooks = async () => {
  try {
    const existingBooks = await Book.find();
    if (existingBooks.length > 0) {
      console.log('📚 Test books already exist, count:', existingBooks.length);
      return existingBooks;
    }

    const books = await Book.insertMany([
      {
        title: 'Introduction to Financial Planning',
        author: 'Money Minds Team',
        image: 'https://example.com/book1.jpg',
        content: 'This comprehensive guide covers the fundamentals of financial planning, including budgeting, saving, and investment strategies for beginners.'
      },
      {
        title: 'Advanced Investment Strategies',
        author: 'Expert Investor',
        image: 'https://example.com/book2.jpg',
        content: 'Learn advanced investment techniques, portfolio diversification, and risk management strategies used by professional investors.'
      },
      {
        title: 'Cryptocurrency Fundamentals',
        author: 'Crypto Expert',
        image: 'https://example.com/book3.jpg',
        content: 'Understanding blockchain technology, cryptocurrency trading, and digital asset management in the modern financial landscape.'
      }
    ]);

    console.log('✅ Test books created, count:', books.length);
    return books;
  } catch (error) {
    console.error('❌ Error creating test books:', error.message);
    throw error;
  }
};

// Create test campus, courses, modules, and lessons
const createTestCourses = async () => {
  try {
    // Check if test campus exists
    let testCampus = await Campus.findOne({ title: 'Test Campus' });
    if (!testCampus) {
      testCampus = await Campus.create({
        title: 'Test Campus',
        slug: 'test-campus',
        description: 'Test campus for API testing',
        imageUrl: 'https://example.com/campus.jpg',
        members: []
      });
      console.log('✅ Test campus created:', testCampus.title);
    } else {
      console.log('🏫 Test campus already exists:', testCampus.title);
    }

    // Check if courses exist
    const existingCourses = await Course.find({ campusId: testCampus._id });
    if (existingCourses.length > 0) {
      console.log('📚 Test courses already exist, count:', existingCourses.length);
      // Get existing lessons for the first course
      const existingLessons = await Lesson.find({ 
        moduleId: { $in: await Module.find({ courseId: existingCourses[0]._id }).distinct('_id') }
      });
      return { campus: testCampus, courses: existingCourses, lessons: existingLessons };
    }

    // Create test course
    const testCourse = await Course.create({
      title: 'Complete Web Development',
      description: 'Learn full-stack web development from basics to advanced',
      campusId: testCampus._id,
      imageUrl: 'https://example.com/course.jpg',
      instructor: 'Tech Expert',
      duration: '40 hours'
    });

    // Create test module
    const testModule = await Module.create({
      name: 'Frontend Development',
      description: 'Learn HTML, CSS, and JavaScript',
      courseId: testCourse._id,
      order: 1
    });

    // Create test lessons with video URLs
    const lessons = await Lesson.insertMany([
      {
        name: 'HTML Basics',
        moduleId: testModule._id,
        videoUrl: 'https://example.com/video1.mp4',
        text: 'HTML is the foundation of web development...',
        length: 600 // 10 minutes
      },
      {
        name: 'CSS Styling',
        moduleId: testModule._id,
        videoUrl: 'https://example.com/video2.mp4',
        text: 'CSS controls the visual presentation...',
        length: 900 // 15 minutes
      },
      {
        name: 'JavaScript Fundamentals',
        moduleId: testModule._id,
        videoUrl: 'https://example.com/video3.mp4',
        text: 'JavaScript adds interactivity to web pages...',
        length: 1200 // 20 minutes
      },
      {
        name: 'Text-only Lesson',
        moduleId: testModule._id,
        videoUrl: '', // No video
        text: 'This lesson contains only text content for reading...',
        length: 0
      }
    ]);

    console.log('✅ Test course structure created:');
    console.log(`   📚 Course: ${testCourse.title}`);
    console.log(`   📖 Module: ${testModule.name}`);
    console.log(`   📝 Lessons: ${lessons.length}`);

    return { campus: testCampus, course: testCourse, module: testModule, lessons };
  } catch (error) {
    console.error('❌ Error creating test courses:', error.message);
    throw error;
  }
};

// Create test videos and series
const createTestVideos = async () => {
  try {
    const existingVideos = await Video.find();
    if (existingVideos.length > 0) {
      console.log('🎬 Test videos already exist, count:', existingVideos.length);
      return existingVideos;
    }

    // Create test series
    const testSeries = await Series.create({
      title: 'Financial Literacy Series',
      description: 'Learn about personal finance through engaging videos',
      imageUrl: 'https://example.com/series.jpg'
    });

    // Create test videos
    const videos = await Video.insertMany([
      {
        title: 'Understanding Budgets',
        description: 'Learn how to create and manage a personal budget',
        type: 'film',
        videoUrl: 'https://example.com/budget-video.mp4',
        imageUrl: 'https://example.com/budget-thumb.jpg',
        duration: 1800, // 30 minutes
        resolutions: [
          { quality: '720p', url: 'https://example.com/budget-720p.mp4' },
          { quality: '480p', url: 'https://example.com/budget-480p.mp4' }
        ]
      },
      {
        title: 'Investment Basics - Episode 1',
        description: 'Introduction to investment principles',
        type: 'episode',
        seriesId: testSeries._id,
        videoUrl: 'https://example.com/investment-ep1.mp4',
        imageUrl: 'https://example.com/investment-thumb.jpg',
        duration: 1500, // 25 minutes
        resolutions: [
          { quality: '720p', url: 'https://example.com/investment-ep1-720p.mp4' },
          { quality: '480p', url: 'https://example.com/investment-ep1-480p.mp4' }
        ]
      },
      {
        title: 'Investment Basics - Episode 2',
        description: 'Stock market fundamentals',
        type: 'episode',
        seriesId: testSeries._id,
        videoUrl: 'https://example.com/investment-ep2.mp4',
        imageUrl: 'https://example.com/investment-thumb.jpg',
        duration: 1200, // 20 minutes
        resolutions: [
          { quality: '720p', url: 'https://example.com/investment-ep2-720p.mp4' },
          { quality: '480p', url: 'https://example.com/investment-ep2-480p.mp4' }
        ]
      }
    ]);

    console.log('✅ Test videos created:');
    console.log(`   📺 Series: ${testSeries.title}`);
    console.log(`   🎬 Videos: ${videos.length}`);

    return { series: testSeries, videos };
  } catch (error) {
    console.error('❌ Error creating test videos:', error.message);
    throw error;
  }
};

// Add user to campus membership
const addUserToCampus = async (userId, campusId) => {
  try {
    const campus = await Campus.findById(campusId);
    if (!campus) {
      throw new Error('Campus not found');
    }

    const isMember = campus.members.some(member => 
      member.userId && member.userId.toString() === userId.toString()
    );

    if (!isMember) {
      campus.members.push({
        userId: userId,
        joinedAt: new Date(),
        role: 'student'
      });
      await campus.save();
      console.log('✅ User added to campus membership');
    } else {
      console.log('👤 User already a member of campus');
    }
  } catch (error) {
    console.error('❌ Error adding user to campus:', error.message);
    throw error;
  }
};

// Main execution function
const main = async () => {
  try {
    console.log('🚀 Starting test data creation...\n');
    
    await connectDB();
    
    // Create test data
    const testUser = await createTestUser();
    const testBooks = await createTestBooks();
    const courseData = await createTestCourses();
    const videoData = await createTestVideos();
    
    // Add user to campus
    await addUserToCampus(testUser._id, courseData.campus._id);
    
    console.log('\n🎉 Test data creation complete!');
    console.log('\n📊 Summary:');
    console.log(`👤 Test User: ${testUser.email} (ID: ${testUser._id})`);
    console.log(`📚 Books: ${testBooks.length}`);
    console.log(`🏫 Campus: ${courseData.campus.title}`);
    console.log(`📚 Courses: 1`);
    console.log(`📝 Lessons: ${courseData.lessons.length}`);
    console.log(`🎬 Videos: ${videoData.videos.length}`);
    
    console.log('\n🧪 Ready for testing!');
    console.log('Use the following test user credentials:');
    console.log(`Email: ${testUser.email}`);
    console.log(`User ID: ${testUser._id}`);
    
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
