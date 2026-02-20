const Queue = require('bull');
const UploadJob = require('../models/uploadJob');
const { URL } = require('url');

let uploadQueue = null;
/** Set at startup only. true if Redis connected successfully, false otherwise. Do not reconnect on request. */
let redisAvailable = false;
let errorLogged = false;

const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Build Redis config for Bull.
 * - Use REDIS_URL if provided.
 * - In development only: if REDIS_URL missing, default to redis://127.0.0.1:6379
 * - Otherwise use REDIS_HOST / REDIS_PORT / REDIS_PASSWORD (and Azure variants)
 */
function getRedisConfig() {
  let redisUrl = process.env.REDIS_URL;

  if (!redisUrl && isDevelopment) {
    redisUrl = 'redis://127.0.0.1:6379';
  }

  if (redisUrl) {
    try {
      const u = new URL(redisUrl);
      return {
        redis: {
          host: u.hostname,
          port: parseInt(u.port || '6379', 10),
          password: u.password || undefined,
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          connectTimeout: 10000,
          lazyConnect: false,
          ...(u.protocol === 'rediss:' && { tls: { rejectUnauthorized: true } })
        }
      };
    } catch (e) {
      console.warn('⚠️ [Upload Queue] Invalid REDIS_URL, falling back to host/port');
    }
  }

  const host = process.env.REDIS_HOST || process.env.AZURE_REDIS_HOST;
  const port = parseInt(process.env.REDIS_PORT || process.env.AZURE_REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || process.env.AZURE_REDIS_PASSWORD || undefined;

  return {
    redis: {
      host: host || '127.0.0.1',
      port,
      password,
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      connectTimeout: 10000,
      lazyConnect: false,
      ...(process.env.AZURE_REDIS_HOST && {
        tls: { servername: process.env.AZURE_REDIS_HOST }
      })
    }
  };
}

/**
 * Initialize Redis connection at server startup. Sets redisAvailable.
 * Does not crash the server on failure.
 * @returns {Promise<void>}
 */
async function initUploadQueue() {
  const redisConfig = getRedisConfig();

  try {
    uploadQueue = new Queue('video-uploads', redisConfig);

    uploadQueue.on('error', (error) => {
      if (!errorLogged) {
        console.error('❌ [Upload Queue] Queue error:', error.message);
        errorLogged = true;
      }
      redisAvailable = false;
    });

    uploadQueue.on('failed', (job, error) => {
      console.error(`❌ [Upload Queue] Job ${job.id} failed:`, error.message);
    });

    uploadQueue.on('completed', (job) => {
      console.log(`✅ [Upload Queue] Job ${job.id} completed successfully`);
    });

    uploadQueue.on('stalled', (job) => {
      console.warn(`⚠️ [Upload Queue] Job ${job.id} stalled, will retry`);
    });

    uploadQueue.on('ready', () => {
      redisAvailable = true;
      errorLogged = false;
    });

    uploadQueue.on('connect', () => {
      redisAvailable = true;
      errorLogged = false;
    });

    uploadQueue.on('disconnect', () => {
      redisAvailable = false;
    });

    await uploadQueue.client.ping();
    redisAvailable = true;
    errorLogged = false;
    console.log('✅ [Upload Queue] Redis connected at startup');

    if (isDevelopment) {
      try {
        await uploadQueue.empty();
        await uploadQueue.clean(0, 'completed');
        await uploadQueue.clean(0, 'failed');
        console.log('🧹 [Upload Queue] Development: cleared previous queue jobs');
      } catch (cleanErr) {
        console.warn('⚠️ [Upload Queue] Development: failed to clear previous jobs:', cleanErr.message);
      }
    }
  } catch (error) {
    redisAvailable = false;
    uploadQueue = null;
    if (isDevelopment) {
      console.warn('⚠️ [Upload Queue] Redis not available locally, using direct upload mode');
    } else {
      console.warn('⚠️ [Upload Queue] Redis connection failed in production, falling back to direct mode');
    }
    console.warn('   Reason:', error.message);
  }
}

/**
 * Check if queue is available (for addUploadJob - queue must exist and be connected).
 * Uses startup result only; no per-request reconnect.
 */
const isQueueAvailable = async () => {
  if (!uploadQueue || !redisAvailable) return false;
  try {
    await uploadQueue.client.ping();
    return true;
  } catch {
    return false;
  }
};

/**
 * Add upload job to queue
 */
const addUploadJob = async (jobData) => {
  const { uploadId, userId, uploadType, type, file } = jobData;

  console.log(`📋 [Upload Queue] Adding job: ${uploadId} (${uploadType})`);

  if (!uploadQueue || !redisAvailable) {
    throw new Error('Upload queue is not available. Redis connection required.');
  }

  try {
    await uploadQueue.client.ping();
  } catch {
    throw new Error('Upload queue is not available. Redis connection required.');
  }

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

  const job = await uploadQueue.add(
    {
      uploadId,
      userId,
      uploadType,
      type,
      tempFilePath: file.path,
      originalFileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype
    },
    {
      jobId: uploadId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      timeout: 7200000,
      removeOnComplete: false,
      removeOnFail: false
    }
  );

  console.log(`✅ [Upload Queue] Job added: ${job.id}`);

  return { job, uploadJob };
};

const getJobStatus = async (uploadId, userId) => {
  const uploadJob = await UploadJob.findOne({ uploadId, userId });
  if (!uploadJob) return null;
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

const updateJobProgress = async (uploadId, progressData) => {
  const updateData = {};
  if (progressData.status != null) updateData.status = progressData.status;
  else if (progressData.stage != null) updateData.status = progressData.stage;
  if (progressData.stage != null) updateData.stage = progressData.stage;
  if (typeof progressData.progress === 'number') updateData.progress = Math.min(100, Math.max(0, progressData.progress));
  if (progressData.message != null) updateData.message = progressData.message;
  if (progressData.uploadSpeed != null) updateData.uploadSpeed = progressData.uploadSpeed;
  if (progressData.uploadedBytes != null) updateData.uploadedBytes = progressData.uploadedBytes;
  if (progressData.stage === 'uploading' && (progressData.progress === 0 || progressData.progress == null)) {
    updateData.startedAt = new Date();
  }
  if (Object.keys(updateData).length === 0) return;
  const updated = await UploadJob.findOneAndUpdate(
    { uploadId },
    { $set: updateData },
    { new: true }
  );
  if (!updated) {
    console.warn(`⚠️ [Upload Queue] updateJobProgress: no job found for uploadId=${uploadId}`);
  }
};

const completeJob = async (uploadId, result) => {
  await UploadJob.findOneAndUpdate(
    { uploadId },
    {
      $set: {
        status: 'completed',
        stage: 'complete',
        progress: 100,
        message: 'Upload completed successfully',
        result,
        completedAt: new Date()
      }
    },
    { new: true }
  );
};

const failJob = async (uploadId, error) => {
  await UploadJob.findOneAndUpdate(
    { uploadId },
    {
      $set: {
        status: 'failed',
        stage: 'error',
        message: `Upload failed: ${error.message}`,
        error: { message: error.message, stack: error.stack, timestamp: new Date() },
        completedAt: new Date()
      }
    },
    { new: true }
  );
};

const cleanupOldJobs = async (daysOld = 7) => {
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  const result = await UploadJob.deleteMany({ status: 'completed', completedAt: { $lt: cutoffDate } });
  console.log(`🧹 [Upload Queue] Cleaned up ${result.deletedCount} old completed jobs`);
  return result.deletedCount;
};

module.exports = {
  get uploadQueue() {
    return uploadQueue;
  },
  get redisAvailable() {
    return redisAvailable;
  },
  initUploadQueue,
  isQueueAvailable,
  addUploadJob,
  getJobStatus,
  updateJobProgress,
  completeJob,
  failJob,
  cleanupOldJobs
};
