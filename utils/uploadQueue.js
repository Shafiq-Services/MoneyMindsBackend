const Queue = require('bull');
const UploadJob = require('../models/uploadJob');

// Redis connection configuration
const redisConfig = {
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  }
};

// Create Bull queue for video uploads
const uploadQueue = new Queue('video-uploads', redisConfig);

// Queue event listeners for monitoring
uploadQueue.on('error', (error) => {
  console.error('❌ [Upload Queue] Queue error:', error.message);
});

uploadQueue.on('failed', (job, error) => {
  console.error(`❌ [Upload Queue] Job ${job.id} failed:`, error.message);
});

uploadQueue.on('completed', (job, result) => {
  console.log(`✅ [Upload Queue] Job ${job.id} completed successfully`);
});

uploadQueue.on('stalled', (job) => {
  console.warn(`⚠️ [Upload Queue] Job ${job.id} stalled, will retry`);
});

/**
 * Add upload job to queue
 * @param {Object} jobData - Job data containing upload information
 * @returns {Promise<Object>} Job instance
 */
const addUploadJob = async (jobData) => {
  const { uploadId, userId, uploadType, type, file } = jobData;
  
  console.log(`📋 [Upload Queue] Adding job: ${uploadId} (${uploadType})`);
  
  // Create job in database
  const uploadJob = await UploadJob.create({
    uploadId,
    userId,
    uploadType,
    type,
    status: 'queued',
    stage: 'queued',
    progress: 0,
    message: `${uploadType.charAt(0).toUpperCase() + uploadType.slice(1)} upload queued`,
    originalFileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype,
    tempFilePath: file.path
  });
  
  // Add to Bull queue with job options
  const job = await uploadQueue.add({
    uploadId,
    userId,
    uploadType,
    type,
    tempFilePath: file.path,
    originalFileName: file.originalname,
    fileSize: file.size,
    mimeType: file.mimetype
  }, {
    jobId: uploadId,
    attempts: 3, // Retry up to 3 times
    backoff: {
      type: 'exponential',
      delay: 5000 // Start with 5 second delay
    },
    timeout: 7200000, // 2 hour timeout
    removeOnComplete: false, // Keep completed jobs for history
    removeOnFail: false // Keep failed jobs for debugging
  });
  
  console.log(`✅ [Upload Queue] Job added: ${job.id}`);
  
  return { job, uploadJob };
};

/**
 * Get job status from database
 * @param {String} uploadId - Upload ID
 * @param {String} userId - User ID for security
 * @returns {Promise<Object>} Upload job status
 */
const getJobStatus = async (uploadId, userId) => {
  const uploadJob = await UploadJob.findOne({ uploadId, userId });
  
  if (!uploadJob) {
    return null;
  }
  
  return {
    uploadId: uploadJob.uploadId,
    uploadType: uploadJob.uploadType,
    type: uploadJob.type,
    status: uploadJob.status,
    stage: uploadJob.stage,
    progress: uploadJob.progress,
    message: uploadJob.message,
    uploadSpeed: uploadJob.uploadSpeed,
    uploadedBytes: uploadJob.uploadedBytes,
    fileSize: uploadJob.fileSize,
    result: uploadJob.result,
    error: uploadJob.error,
    createdAt: uploadJob.createdAt,
    startedAt: uploadJob.startedAt,
    completedAt: uploadJob.completedAt
  };
};

/**
 * Update job progress in database
 * @param {String} uploadId - Upload ID
 * @param {Object} progressData - Progress update data
 */
const updateJobProgress = async (uploadId, progressData) => {
  const updateData = {
    status: progressData.status || progressData.stage,
    stage: progressData.stage,
    progress: progressData.progress,
    message: progressData.message
  };
  
  // Add optional fields if present
  if (progressData.uploadSpeed) updateData.uploadSpeed = progressData.uploadSpeed;
  if (progressData.uploadedBytes) updateData.uploadedBytes = progressData.uploadedBytes;
  
  // Set startedAt timestamp if moving from queued to processing
  if (progressData.stage === 'uploading' && progressData.progress === 0) {
    updateData.startedAt = new Date();
  }
  
  await UploadJob.findOneAndUpdate(
    { uploadId },
    { $set: updateData },
    { new: true }
  );
};

/**
 * Mark job as completed in database
 * @param {String} uploadId - Upload ID
 * @param {Object} result - Result data
 */
const completeJob = async (uploadId, result) => {
  await UploadJob.findOneAndUpdate(
    { uploadId },
    { 
      $set: {
        status: 'completed',
        stage: 'complete',
        progress: 100,
        message: 'Upload completed successfully',
        result: result,
        completedAt: new Date()
      }
    },
    { new: true }
  );
};

/**
 * Mark job as failed in database
 * @param {String} uploadId - Upload ID
 * @param {Error} error - Error object
 */
const failJob = async (uploadId, error) => {
  await UploadJob.findOneAndUpdate(
    { uploadId },
    { 
      $set: {
        status: 'failed',
        stage: 'error',
        message: `Upload failed: ${error.message}`,
        error: {
          message: error.message,
          stack: error.stack,
          timestamp: new Date()
        },
        completedAt: new Date()
      }
    },
    { new: true }
  );
};

/**
 * Clean up old completed jobs (optional maintenance)
 * @param {Number} daysOld - Remove jobs older than this many days
 */
const cleanupOldJobs = async (daysOld = 7) => {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  
  const result = await UploadJob.deleteMany({
    status: 'completed',
    completedAt: { $lt: cutoffDate }
  });
  
  console.log(`🧹 [Upload Queue] Cleaned up ${result.deletedCount} old completed jobs`);
  return result.deletedCount;
};

module.exports = {
  uploadQueue,
  addUploadJob,
  getJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  cleanupOldJobs
};



