require('dotenv').config();
const mongoose = require('mongoose');
const config = require('../config/config');
const User = require('../models/user');

// Import improved controllers
const { getContinueReadingImproved } = require('../controllers/bookControllerImproved');
const { getContinueLearningOptimized } = require('../controllers/courseControllerOptimized');
const { getContinueWatchingImproved } = require('../controllers/videoControllerImproved');

// Import original controllers for comparison
const { getContinueReading } = require('../controllers/book');
const { getContinueLearning } = require('../controllers/courseController');
const { getContinueWatching } = require('../controllers/video');

// Mock response object
const createMockResponse = () => {
  const res = {
    status: (code) => res,
    json: (data) => {
      res._data = data;
      return res;
    },
    _data: null,
    _statusCode: 200
  };
  return res;
};

// Mock request object
const createMockRequest = (userId, query = {}) => ({
  userId,
  query
});

// Performance testing utility
const measurePerformance = async (name, fn) => {
  const startTime = process.hrtime.bigint();
  const startMemory = process.memoryUsage();
  
  try {
    const result = await fn();
    const endTime = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const executionTime = Number(endTime - startTime) / 1000000; // Convert to milliseconds
    const memoryUsed = endMemory.heapUsed - startMemory.heapUsed;
    
    console.log(`⏱️  ${name}:`);
    console.log(`   Execution time: ${executionTime.toFixed(2)}ms`);
    console.log(`   Memory used: ${(memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`   Status: ${result.success ? '✅ Success' : '❌ Failed'}`);
    
    return {
      name,
      executionTime,
      memoryUsed,
      success: result.success,
      dataSize: result.dataSize || 0
    };
  } catch (error) {
    console.log(`❌ ${name} failed:`, error.message);
    return {
      name,
      executionTime: -1,
      memoryUsed: -1,
      success: false,
      error: error.message
    };
  }
};

// Test continue reading APIs
const testContinueReading = async (userId) => {
  console.log('\n📚 Testing Continue Reading APIs...');
  
  const originalTest = await measurePerformance('Original Continue Reading', async () => {
    const req = createMockRequest(userId);
    const res = createMockResponse();
    
    await getContinueReading(req, res);
    
    return {
      success: res._data?.status === true,
      dataSize: res._data?.continueReading?.length || 0
    };
  });
  
  const improvedTest = await measurePerformance('Improved Continue Reading', async () => {
    const req = createMockRequest(userId, { page: 1, limit: 10 });
    const res = createMockResponse();
    
    await getContinueReadingImproved(req, res);
    
    return {
      success: res._data?.status === true,
      dataSize: res._data?.continueReading?.length || 0
    };
  });
  
  return { original: originalTest, improved: improvedTest };
};

// Test continue learning APIs
const testContinueLearning = async (userId) => {
  console.log('\n🎓 Testing Continue Learning APIs...');
  
  const originalTest = await measurePerformance('Original Continue Learning', async () => {
    const req = createMockRequest(userId);
    const res = createMockResponse();
    
    await getContinueLearning(req, res);
    
    return {
      success: res._data?.status === true,
      dataSize: res._data?.continueLearning?.continueLearning?.length || 0
    };
  });
  
  const optimizedTest = await measurePerformance('Optimized Continue Learning', async () => {
    const req = createMockRequest(userId, { page: 1, limit: 10 });
    const res = createMockResponse();
    
    await getContinueLearningOptimized(req, res);
    
    return {
      success: res._data?.status === true,
      dataSize: res._data?.continueLearning?.length || 0
    };
  });
  
  return { original: originalTest, optimized: optimizedTest };
};

// Test continue watching APIs
const testContinueWatching = async (userId) => {
  console.log('\n🎬 Testing Continue Watching APIs...');
  
  const originalTest = await measurePerformance('Original Continue Watching', async () => {
    const req = createMockRequest(userId);
    const res = createMockResponse();
    
    await getContinueWatching(req, res);
    
    return {
      success: res._data?.status === true,
      dataSize: res._data?.continueWatching?.length || 0
    };
  });
  
  const improvedTest = await measurePerformance('Improved Continue Watching', async () => {
    const req = createMockRequest(userId, { 
      page: 1, 
      limit: 20, 
      minProgress: 1, 
      maxProgress: 99,
      sortBy: 'lastWatched'
    });
    const res = createMockResponse();
    
    await getContinueWatchingImproved(req, res);
    
    return {
      success: res._data?.status === true,
      dataSize: res._data?.continueWatching?.length || 0
    };
  });
  
  return { original: originalTest, improved: improvedTest };
};

// Generate performance comparison report
const generateReport = (testResults) => {
  console.log('\n📊 Performance Comparison Report');
  console.log('=================================');
  
  for (const [apiName, results] of Object.entries(testResults)) {
    console.log(`\n${apiName.toUpperCase()}:`);
    
    const original = results.original || results.optimized;
    const improved = results.improved || results.optimized;
    
    if (original && improved && original.success && improved.success) {
      const timeDiff = original.executionTime - improved.executionTime;
      const timeImprovement = ((timeDiff / original.executionTime) * 100).toFixed(1);
      
      const memoryDiff = original.memoryUsed - improved.memoryUsed;
      const memoryImprovement = original.memoryUsed !== 0 ? 
        ((memoryDiff / Math.abs(original.memoryUsed)) * 100).toFixed(1) : 'N/A';
      
      console.log(`   ⏱️  Execution Time:`);
      console.log(`      Original: ${original.executionTime.toFixed(2)}ms`);
      console.log(`      Improved: ${improved.executionTime.toFixed(2)}ms`);
      console.log(`      ${timeDiff > 0 ? '🚀 Improvement' : '⚠️  Regression'}: ${Math.abs(timeImprovement)}%`);
      
      console.log(`   💾 Memory Usage:`);
      console.log(`      Original: ${(original.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`      Improved: ${(improved.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
      console.log(`      ${memoryDiff > 0 ? '🚀 Improvement' : '⚠️  Regression'}: ${Math.abs(memoryImprovement)}%`);
      
      console.log(`   📊 Data Size:`);
      console.log(`      Original: ${original.dataSize} items`);
      console.log(`      Improved: ${improved.dataSize} items`);
    } else {
      console.log(`   ❌ Cannot compare - one or both tests failed`);
      if (original) console.log(`      Original: ${original.success ? 'Success' : 'Failed'}`);
      if (improved) console.log(`      Improved: ${improved.success ? 'Success' : 'Failed'}`);
    }
  }
};

// Main testing function
const main = async () => {
  try {
    console.log('🧪 Starting Improved APIs Performance Testing...\n');
    
    await mongoose.connect(config.MONGO_URI);
    console.log('✅ MongoDB connected');
    
    // Get test user
    const testUser = await User.findOne({ email: 'testuser@example.com' });
    if (!testUser) {
      throw new Error('Test user not found. Please run createTestData.js first.');
    }
    
    console.log(`👤 Using test user: ${testUser.email} (${testUser._id})`);
    
    // Run performance tests
    const testResults = {
      'Continue Reading': await testContinueReading(testUser._id),
      'Continue Learning': await testContinueLearning(testUser._id),
      'Continue Watching': await testContinueWatching(testUser._id)
    };
    
    // Generate comparison report
    generateReport(testResults);
    
    console.log('\n🎉 Performance testing completed!');
    
    // Summary of improvements
    console.log('\n💡 Key Improvements Implemented:');
    console.log('================================');
    console.log('📚 Continue Reading:');
    console.log('   ✅ Added pagination support');
    console.log('   ✅ Better input validation');
    console.log('   ✅ Enhanced error handling');
    console.log('   ✅ Added sorting options');
    console.log('   ✅ Estimated reading time calculation');
    
    console.log('\n🎓 Continue Learning:');
    console.log('   ✅ Optimized database queries');
    console.log('   ✅ Reduced aggregation complexity');
    console.log('   ✅ Better progress caching');
    console.log('   ✅ Early return for empty data');
    console.log('   ✅ More efficient campus handling');
    
    console.log('\n🎬 Continue Watching:');
    console.log('   ✅ Enhanced filtering options');
    console.log('   ✅ Better data consistency');
    console.log('   ✅ Progress categorization');
    console.log('   ✅ Comprehensive statistics');
    console.log('   ✅ Multiple sorting options');
    
    console.log('\n🔧 General Improvements:');
    console.log('   ✅ Better error handling and validation');
    console.log('   ✅ Improved data consistency');
    console.log('   ✅ Enhanced performance monitoring');
    console.log('   ✅ Pagination support across all APIs');
    console.log('   ✅ Better logging and debugging');
    console.log('   ✅ Input sanitization');
    console.log('   ✅ Memory optimization');
    
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
