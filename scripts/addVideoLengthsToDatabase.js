const mongoose = require('mongoose');
const Video = require('../models/video');
const Lesson = require('../models/lesson');
const { calculateVideoDuration } = require('../utils/videoDuration');
const path = require('path');

// Database connection
const connectDB = async () => {
  try {
    await mongoose.connect("mongodb+srv://offshafiqahmad:moneyminds123%40%24%5E@cluster0.csfr1qq.mongodb.net/moneyminds?retryWrites=true&w=majority&appName=Cluster0");
    console.log('✅ Connected to MongoDB');
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error.message);
    process.exit(1);
  }
};

// Function to update video lengths
const updateVideoLengths = async () => {
  try {
    console.log('\n🎬 Processing Videos Collection...');
    
    // Find videos with missing or zero length
    const videosToUpdate = await Video.find({
      $or: [
        { length: { $exists: false } },
        { length: 0 },
        { length: null }
      ],
      videoUrl: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`📊 Found ${videosToUpdate.length} videos needing length calculation`);

    if (videosToUpdate.length === 0) {
      console.log('✅ All videos already have length data');
      return { processed: 0, success: 0, failed: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < videosToUpdate.length; i++) {
      const video = videosToUpdate[i];
      const progress = `[${i + 1}/${videosToUpdate.length}]`;
      
      console.log(`${progress} Processing video: "${video.title || 'Untitled'}" (${video._id})`);
      console.log(`${progress} Video URL: ${video.videoUrl}`);

      try {
        // Calculate duration using the same utility function
        const duration = await calculateVideoDuration(video.videoUrl);
        
        if (duration > 0) {
          // Update the video with calculated duration
          await Video.findByIdAndUpdate(video._id, { length: duration });
          console.log(`${progress} ✅ Success: Updated length to ${duration} seconds`);
          successCount++;
        } else {
          console.log(`${progress} ⚠️ Warning: Could not calculate duration (set to 0)`);
          await Video.findByIdAndUpdate(video._id, { length: 0 });
          failedCount++;
        }
      } catch (error) {
        console.error(`${progress} ❌ Error processing video:`, error.message);
        // Set length to 0 for failed calculations
        await Video.findByIdAndUpdate(video._id, { length: 0 });
        failedCount++;
      }

      // Add small delay to prevent overwhelming the system
      if (i < videosToUpdate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n📈 Videos Summary:`);
    console.log(`   Total processed: ${videosToUpdate.length}`);
    console.log(`   Successfully calculated: ${successCount}`);
    console.log(`   Failed calculations: ${failedCount}`);

    return { processed: videosToUpdate.length, success: successCount, failed: failedCount };

  } catch (error) {
    console.error('❌ Error in updateVideoLengths:', error.message);
    throw error;
  }
};

// Function to update lesson lengths
const updateLessonLengths = async () => {
  try {
    console.log('\n📚 Processing Lessons Collection...');
    
    // Find lessons with missing or zero length
    const lessonsToUpdate = await Lesson.find({
      $or: [
        { length: { $exists: false } },
        { length: 0 },
        { length: null }
      ],
      videoUrl: { $exists: true, $ne: null, $ne: '' }
    });

    console.log(`📊 Found ${lessonsToUpdate.length} lessons needing length calculation`);

    if (lessonsToUpdate.length === 0) {
      console.log('✅ All lessons already have length data');
      return { processed: 0, success: 0, failed: 0 };
    }

    let successCount = 0;
    let failedCount = 0;

    for (let i = 0; i < lessonsToUpdate.length; i++) {
      const lesson = lessonsToUpdate[i];
      const progress = `[${i + 1}/${lessonsToUpdate.length}]`;
      
      console.log(`${progress} Processing lesson: "${lesson.name || 'Untitled'}" (${lesson._id})`);
      console.log(`${progress} Video URL: ${lesson.videoUrl}`);

      try {
        // Calculate duration using the same utility function
        const duration = await calculateVideoDuration(lesson.videoUrl);
        
        if (duration > 0) {
          // Update the lesson with calculated duration
          await Lesson.findByIdAndUpdate(lesson._id, { length: duration });
          console.log(`${progress} ✅ Success: Updated length to ${duration} seconds`);
          successCount++;
        } else {
          console.log(`${progress} ⚠️ Warning: Could not calculate duration (set to 0)`);
          await Lesson.findByIdAndUpdate(lesson._id, { length: 0 });
          failedCount++;
        }
      } catch (error) {
        console.error(`${progress} ❌ Error processing lesson:`, error.message);
        // Set length to 0 for failed calculations
        await Lesson.findByIdAndUpdate(lesson._id, { length: 0 });
        failedCount++;
      }

      // Add small delay to prevent overwhelming the system
      if (i < lessonsToUpdate.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n📈 Lessons Summary:`);
    console.log(`   Total processed: ${lessonsToUpdate.length}`);
    console.log(`   Successfully calculated: ${successCount}`);
    console.log(`   Failed calculations: ${failedCount}`);

    return { processed: lessonsToUpdate.length, success: successCount, failed: failedCount };

  } catch (error) {
    console.error('❌ Error in updateLessonLengths:', error.message);
    throw error;
  }
};

// Function to generate final report
const generateReport = (videoStats, lessonStats) => {
  const totalProcessed = videoStats.processed + lessonStats.processed;
  const totalSuccess = videoStats.success + lessonStats.success;
  const totalFailed = videoStats.failed + lessonStats.failed;

  console.log(`\n🎯 FINAL REPORT`);
  console.log(`===============================================`);
  console.log(`📊 Total items processed: ${totalProcessed}`);
  console.log(`   - Videos: ${videoStats.processed}`);
  console.log(`   - Lessons: ${lessonStats.processed}`);
  console.log(`\n✅ Successfully calculated: ${totalSuccess}`);
  console.log(`   - Videos: ${videoStats.success}`);
  console.log(`   - Lessons: ${lessonStats.success}`);
  console.log(`\n❌ Failed calculations: ${totalFailed}`);
  console.log(`   - Videos: ${videoStats.failed}`);
  console.log(`   - Lessons: ${lessonStats.failed}`);
  
  if (totalProcessed > 0) {
    const successRate = ((totalSuccess / totalProcessed) * 100).toFixed(1);
    console.log(`\n📈 Success Rate: ${successRate}%`);
  }
  
  console.log(`===============================================`);
};

// Main execution function
const main = async () => {
  const startTime = Date.now();
  
  console.log('🚀 Starting Video Length Update Script');
  console.log('=====================================');
  console.log('📋 This script will:');
  console.log('   1. Find all videos with missing/zero length');
  console.log('   2. Find all lessons with missing/zero length');
  console.log('   3. Calculate duration for each video/lesson');
  console.log('   4. Update the database with calculated lengths');
  console.log('=====================================\n');

  try {
    // Connect to database
    await connectDB();

    // Process videos
    const videoStats = await updateVideoLengths();

    // Process lessons
    const lessonStats = await updateLessonLengths();

    // Generate final report
    generateReport(videoStats, lessonStats);

    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
    console.log(`⏱️ Script completed in ${duration} minutes`);

  } catch (error) {
    console.error('\n💥 Script failed with error:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    // Close database connection
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
    process.exit(0);
  }
};

// Handle script interruption
process.on('SIGINT', async () => {
  console.log('\n⚠️ Script interrupted by user');
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.close();
    console.log('🔌 Database connection closed');
  }
  process.exit(0);
});

// Run the script
main(); 