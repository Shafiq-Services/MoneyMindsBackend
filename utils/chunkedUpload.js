const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const B2 = require('backblaze-b2');
const { getB2S3Url } = require('./b2Url');

/**
 * Helper function to convert a readable stream to a Buffer
 * Memory-efficient streaming for large file parts
 */
const streamToBuffer = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
};

/**
 * Calculate SHA-1 hash of entire file for large file uploads
 * B2 recommends this for interoperability
 */
const calculateFileSha1 = async (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha1');
    const stream = fs.createReadStream(filePath);
    
    stream.on('data', (chunk) => {
      hash.update(chunk);
    });
    
    stream.on('end', () => {
      resolve(hash.digest('hex'));
    });
    
    stream.on('error', (error) => {
      reject(error);
    });
  });
};

// Initialize B2 instance with proper configuration
// User-Agent follows B2 guidelines: <product>/<version>+<dependencies>
const b2Instance = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  userAgent: 'money-minds-backend/1.0.0+node/' + process.version
});

// Configurable timeout for part uploads (default 60 seconds)
const PART_TIMEOUT_MS = parseInt(process.env.PART_TIMEOUT_MS) || 60000;

let authData = null;

/**
 * Authorize B2 with retry logic for DNS issues
 * Enhanced with connection timeout and retry mechanism
 */
const authorize = async (maxRetries = 3) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (!authData) {
        console.log(`🔐 Authorizing B2 account (attempt ${attempt}/${maxRetries})...`);
        authData = await b2Instance.authorize();
        console.log('✅ B2 authorization successful');
      }
      return authData;
    } catch (error) {
      console.error(`❌ B2 authorization attempt ${attempt} failed:`, error.message);
      
      if (attempt === maxRetries) {
        throw new Error(`B2 authorization failed after ${maxRetries} attempts: ${error.message}`);
      }
      
      // Wait before retry with exponential backoff
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

/**
 * Granular progress tracker for real-time upload monitoring
 * Tracks both completed parts and in-progress parts for smooth updates
 */
class UploadProgressTracker {
  constructor(fileSize, totalChunks, progressCallback, startTime = Date.now()) {
    this.fileSize = fileSize;
    this.totalChunks = totalChunks;
    this.progressCallback = progressCallback;
    this.startTime = startTime;
    this.completedParts = [];
    this.activeParts = new Map(); // partNumber -> { size, startTime }
    this.completedBytes = 0;
    
    // Start progress updates every second
    this.interval = setInterval(() => this.updateProgress(), 1000);
    this.updateProgress(); // Send initial progress
  }

  startPart(partNumber, size) {
    this.activeParts.set(partNumber, { size, startTime: Date.now() });
  }

  completePart(partNumber, result) {
    this.activeParts.delete(partNumber);
    if (!this.completedParts.find(p => p.partNumber === partNumber)) {
      this.completedParts.push(result);
      this.completedBytes += result.contentLength;
    }
  }

  updateProgress() {
    if (!this.progressCallback) return;

    // Only count completed bytes, don't estimate active parts
    const totalUploadedBytes = this.completedBytes;
    const progress = Math.min(Math.round((totalUploadedBytes / this.fileSize) * 100), 99);
    const now = Date.now();
    const elapsedTime = (now - this.startTime) / 1000;
    const uploadSpeed = elapsedTime > 0 ? (totalUploadedBytes / elapsedTime) : 0;
    const remainingBytes = this.fileSize - totalUploadedBytes;
    const timeRemaining = uploadSpeed > 0 ? Math.ceil(remainingBytes / uploadSpeed) : 0;

    this.progressCallback({
      stage: 'uploading',
      progress,
      completedChunks: this.completedParts.length,
      totalChunks: this.totalChunks,
      currentChunk: this.completedParts.length + this.activeParts.size,
      message: `Uploading: ${progress}% (${this.completedParts.length}/${this.totalChunks} parts, ${this.activeParts.size} active)`,
      fileSize: this.fileSize,
      uploadedBytes: Math.round(totalUploadedBytes),
      uploadSpeed: `${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
      timeRemaining: `${Math.floor(timeRemaining / 60)}m ${timeRemaining % 60}s`
    });
  }

  destroy() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }
}

/**
 * Optimized large file upload with granular progress tracking
 */
const uploadLargeFileOptimized = async (filePath, fileName, chunkSize = 100 * 1024 * 1024, progressCallback = null, resumeState = null) => {
  let progressTracker = null;
  
  try {
    await authorize();
    
    const bucketId = process.env.B2_BUCKET_ID;
    const fileSize = fs.statSync(filePath).size;
    const PART_SIZE = Math.min(Math.max(chunkSize, 5 * 1024 * 1024), 10 * 1024 * 1024); // Reduced max part size to 10MB for better reliability
    
    console.log(`📤 Large file upload: ${fileName} (${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB)`);
    
    if (!bucketId) throw new Error('B2_BUCKET_ID not configured');

    let fileId = resumeState?.fileId;
    const totalChunks = Math.ceil(fileSize / PART_SIZE);
    const startTime = Date.now();
    
    // Initialize progress tracker
    progressTracker = new UploadProgressTracker(fileSize, totalChunks, progressCallback, startTime);

    try {
      // Test B2 connectivity first
      console.log('🔍 Testing B2 connectivity...');
      try {
        await b2Instance.getUploadUrl({ bucketId });
        console.log('✅ B2 connectivity test passed');
      } catch (connectError) {
        console.error('❌ B2 connectivity test failed:', connectError.message);
        throw new Error(`B2 connectivity failed: ${connectError.message}`);
      }
      
      // Test network speed with a small upload
      console.log('🔍 Testing network upload speed...');
      try {
        const testUploadUrl = await b2Instance.getUploadUrl({ bucketId });
        const testData = Buffer.from('test-upload-speed-check');
        const startTime = Date.now();
        
        await b2Instance.uploadFile({
          uploadUrl: testUploadUrl.data.uploadUrl,
          uploadAuthToken: testUploadUrl.data.authorizationToken,
          fileName: 'test-speed-check',
          data: testData
        });
        
        const testTime = Date.now() - startTime;
        console.log(`✅ Network test completed in ${testTime}ms`);
        
        if (testTime > 10000) {
          console.warn('⚠️ Slow network detected - uploads may timeout');
        }
      } catch (testError) {
        console.warn('⚠️ Network speed test failed:', testError.message);
      }
      
      // Start or resume large file upload
      if (!fileId) {
        console.log('🔍 Calculating file SHA-1 for large file upload...');
        const fileSha1 = await calculateFileSha1(filePath);
        const fileStats = fs.statSync(filePath);
        const lastModifiedMillis = fileStats.mtime.getTime();
        
        const response = await b2Instance.startLargeFile({ 
          bucketId, 
          fileName, 
          contentType: 'application/octet-stream',
          // B2 recommended metadata headers for interoperability
          'X-Bz-Info-src_last_modified_millis': lastModifiedMillis.toString(),
          'X-Bz-Info-large_file_sha1': fileSha1
        });
        fileId = response.data.fileId;
        console.log(`🚀 Started upload: ${fileId} (SHA-1: ${fileSha1.substring(0, 8)}...)`);
      } else {
        console.log(`🔄 Resuming upload: ${fileId}`);
        // Load existing parts into progress tracker
        try {
          const existingParts = await b2Instance.listParts({ fileId, startPartNumber: 1, maxPartCount: 10000 });
          (existingParts.data.parts || []).forEach(part => {
            progressTracker.completePart(part.partNumber, part);
          });
          console.log(`📋 Resumed with ${existingParts.data.parts?.length || 0} existing parts`);
        } catch (listError) {
          console.warn('⚠️ Could not list existing parts:', listError.message);
        }
      }

      // Generate parts to upload
      const partsToUpload = [];
      for (let partNumber = 1; partNumber <= totalChunks; partNumber++) {
        if (!progressTracker.completedParts.find(p => p.partNumber === partNumber)) {
          const start = (partNumber - 1) * PART_SIZE;
          const end = Math.min(start + PART_SIZE, fileSize);
          partsToUpload.push({ partNumber, start, end, size: end - start });
        }
      }

      console.log(`📤 Uploading ${partsToUpload.length} parts (${progressTracker.completedParts.length} already done)`);

      // Upload parts in parallel batches (reduced to 2 for better reliability)
      const MAX_PARALLEL = 2;
      for (let i = 0; i < partsToUpload.length; i += MAX_PARALLEL) {
        const batch = partsToUpload.slice(i, i + MAX_PARALLEL);
        await Promise.all(batch.map(part => uploadPartWithRetry(fileId, filePath, part, 3, progressTracker)));
      }

      // Complete upload
      progressTracker.completedParts.sort((a, b) => a.partNumber - b.partNumber);
      const response = await b2Instance.finishLargeFile({
        fileId,
        partSha1Array: progressTracker.completedParts.map(p => p.contentSha1)
      });

      progressTracker.destroy();
      console.log(`✅ Upload completed: ${response.data.fileId}`);

      // Final progress
      if (progressCallback) {
        progressCallback({
          stage: 'complete', progress: 100, completedChunks: totalChunks, totalChunks,
          message: 'Upload complete!', fileSize, uploadedBytes: fileSize,
          uploadSpeed: `${((fileSize / ((Date.now() - startTime) / 1000)) / 1024 / 1024).toFixed(2)} MB/s`
        });
      }

      return {
        fileId: response.data.fileId, fileName: response.data.fileName, fileUrl: getB2S3Url(fileName),
        fileSize, totalChunks, uploadTime: Math.round((Date.now() - startTime) / 1000)
      };

    } catch (error) {
      progressTracker?.destroy();
      console.error('❌ Large file upload failed:', error.message);
      
      // If we have some completed parts, save resume state
      if (progressTracker?.completedParts.length > 0) {
        error.resumeState = {
          fileId, uploadedParts: progressTracker?.completedParts || [],
          completedChunks: progressTracker?.completedParts.length || 0, totalChunks
        };
      }
      
      // If large file upload fails completely, try regular upload as fallback
      if (progressTracker?.completedParts.length === 0) {
        console.log('🔄 Large file upload failed completely, trying regular upload as fallback...');
        try {
          return await uploadSmallFileOptimized(filePath, fileName, progressCallback);
        } catch (fallbackError) {
          console.error('❌ Fallback upload also failed:', fallbackError.message);
        }
      }
      
      // If we have some completed parts but upload is still failing, try smaller parts
      if (progressTracker?.completedParts.length > 0 && progressTracker?.completedParts.length < 3) {
        console.log('🔄 Upload struggling with current part size, trying smaller parts...');
        try {
          // Try with 5MB parts instead of 10MB
          return await uploadLargeFileOptimized(filePath, fileName, 5 * 1024 * 1024, progressCallback, {
            fileId,
            uploadedParts: progressTracker.completedParts,
            completedChunks: progressTracker.completedParts.length,
            totalChunks: Math.ceil(fileSize / (5 * 1024 * 1024))
          });
        } catch (smallerPartsError) {
          console.error('❌ Smaller parts upload also failed:', smallerPartsError.message);
        }
      }
      
      throw error;
    }

  } catch (error) {
    console.error('❌ Upload initialization failed:', error.message);
    throw new Error(`Large file upload failed: ${error.message}`);
  }
};

/**
 * Upload a single part with granular progress tracking
 * Memory-efficient streaming upload with performance timing
 */
const uploadPartWithRetry = async (fileId, filePath, partInfo, maxRetries = 3, progressTracker = null) => {
  const { partNumber, start, end, size } = partInfo;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const partStartTime = Date.now();
    
    try {
      console.log(`📤 Part ${partNumber} (${(size / 1024 / 1024).toFixed(2)}MB) - attempt ${attempt}`);
      
      // Get fresh upload URL for each attempt (B2 best practice)
      console.log(`🔗 Getting upload URL for part ${partNumber}...`);
      const uploadPartUrl = await b2Instance.getUploadPartUrl({ fileId });
      console.log(`🔗 Got upload URL for part ${partNumber}`);
      
      // Memory-efficient streaming read using streamToBuffer helper
      console.log(`📖 Reading part ${partNumber} from file (${start}-${end-1})...`);
      const chunkStream = fs.createReadStream(filePath, { start, end: end - 1 });
      const chunkBuffer = await streamToBuffer(chunkStream);
      console.log(`📖 Read part ${partNumber} (${chunkBuffer.length} bytes)`);
      
      // Track upload start
      if (progressTracker) {
        progressTracker.startPart(partNumber, size);
      }
      
      console.log(`📤 Uploading part ${partNumber} to B2...`);
      
      // Add timeout to detect hanging uploads (configurable via PART_TIMEOUT_MS)
      const uploadPromise = b2Instance.uploadPart({
        uploadUrl: uploadPartUrl.data.uploadUrl,
        uploadAuthToken: uploadPartUrl.data.authorizationToken,
        partNumber,
        data: chunkBuffer
      });
      
      // Add progress tracking to detect if upload is actually progressing
      let uploadStarted = false;
      const progressCheck = setInterval(() => {
        if (!uploadStarted) {
          console.log(`⏳ Part ${partNumber} upload in progress...`);
          uploadStarted = true;
        }
      }, 10000); // Log progress every 10 seconds
      
      const response = await Promise.race([
        uploadPromise,
        new Promise((_, reject) => 
          setTimeout(() => {
            clearInterval(progressCheck);
            reject(new Error(`Part ${partNumber} upload timeout after ${PART_TIMEOUT_MS/1000} seconds`));
          }, PART_TIMEOUT_MS)
        )
      ]);
      
      clearInterval(progressCheck);
      
      console.log(`✅ Part ${partNumber} uploaded successfully to B2`);
      const result = { partNumber, contentSha1: response.data.contentSha1, contentLength: size };
      
      // Mark part as completed
      if (progressTracker) {
        progressTracker.completePart(partNumber, result);
      }
      
      const uploadTime = ((Date.now() - partStartTime) / 1000).toFixed(1);
      console.log(`✅ Part ${partNumber} uploaded in ${uploadTime}s (${response.data.contentSha1.substring(0, 8)}...)`);
      return result;
      
    } catch (error) {
      const failTime = ((Date.now() - partStartTime) / 1000).toFixed(1);
      console.error(`❌ Part ${partNumber} attempt ${attempt} failed in ${failTime}s:`, error.message);
      
      // Check if we need to get a new upload URL (B2 best practice)
      const shouldGetNewUrl = error.message.includes('timeout') || 
                              error.message.includes('connection') ||
                              error.message.includes('408') ||
                              error.message.includes('5') ||
                              error.status >= 500;
      
      if (shouldGetNewUrl && attempt < maxRetries) {
        console.log(`🔄 Getting new upload URL for part ${partNumber} due to ${error.message}`);
        // Don't wait here - the next attempt will get a fresh URL
      }
      
      if (attempt === maxRetries) throw new Error(`Part ${partNumber} failed after ${maxRetries} attempts: ${error.message}`);
      
      // Add longer delay between retries to avoid overwhelming B2 servers
      const retryDelay = Math.min(2000 * Math.pow(2, attempt - 1), 60000);
      console.log(`⏳ Waiting ${retryDelay}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

/**
 * Smart upload function that automatically chooses the best upload method
 * Handles both small and large files according to B2 best practices
 */
const uploadFileOptimized = async (filePath, fileName, progressCallback = null, resumeState = null) => {
  try {
    const fileSize = fs.statSync(filePath).size;
    const LARGE_FILE_THRESHOLD = 100 * 1024 * 1024; // 100MB threshold (B2 recommends large file API for files > 100MB)
    
    if (fileSize > LARGE_FILE_THRESHOLD) {
      // Use large file API for files > 100MB
      return await uploadLargeFileOptimized(filePath, fileName, 100 * 1024 * 1024, progressCallback, resumeState);
    } else {
      // Use regular upload for smaller files
      return await uploadSmallFileOptimized(filePath, fileName, progressCallback);
    }
    
  } catch (error) {
    console.error('❌ Optimized upload failed:', error.message);
    throw error;
  }
};

/**
 * Optimized small file upload with progress tracking
 * Memory-efficient streaming for files under 100MB
 */
const uploadSmallFileOptimized = async (filePath, fileName, progressCallback = null) => {
  const startTime = Date.now();
  
  try {
    await authorize();
    
    const bucketId = process.env.B2_BUCKET_ID;
    const fileSize = fs.statSync(filePath).size;
    
    console.log(`📤 Small file upload: ${fileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
    
    const uploadUrl = await b2Instance.getUploadUrl({ bucketId });
    
    // Memory-efficient streaming read using streamToBuffer helper
    const fileStream = fs.createReadStream(filePath);
    const fileBuffer = await streamToBuffer(fileStream);
    
    if (progressCallback) {
      progressCallback({
        stage: 'uploading', progress: 0, message: 'Starting upload...',
        fileSize, uploadedBytes: 0
      });
    }
    
    // Add B2 recommended metadata for small files too
    const fileStats = fs.statSync(filePath);
    const lastModifiedMillis = fileStats.mtime.getTime();
    
    const response = await b2Instance.uploadFile({
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      fileName,
      data: fileBuffer,
      'X-Bz-Info-src_last_modified_millis': lastModifiedMillis.toString()
    });
    
    const uploadTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`✅ Small file uploaded in ${uploadTime}s: ${response.data.fileId}`);
    
    if (progressCallback) {
      const avgSpeed = (fileSize / ((Date.now() - startTime) / 1000)) / 1024 / 1024;
      progressCallback({
        stage: 'complete', progress: 100, message: 'Upload complete!',
        fileSize, uploadedBytes: fileSize, uploadSpeed: `${avgSpeed.toFixed(2)} MB/s`,
        uploadTime: Math.round((Date.now() - startTime) / 1000)
      });
    }
    
    return {
      fileId: response.data.fileId, fileName: response.data.fileName,
      fileUrl: getB2S3Url(fileName), fileSize, totalChunks: 1
    };
    
  } catch (error) {
    const failTime = ((Date.now() - startTime) / 1000).toFixed(1);
    console.error(`❌ Small file upload failed in ${failTime}s:`, error.message);
    throw new Error(`Small file upload failed: ${error.message}`);
  }
};

/**
 * Enhanced upload with comprehensive retry logic and resume capability
 * Supports automatic resume of failed large file uploads
 */
const uploadFileWithRetry = async (filePath, fileName, maxRetries = 3, progressCallback = null) => {
  let lastResumeState = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Upload attempt ${attempt}/${maxRetries}`);
      
      return await uploadFileOptimized(filePath, fileName, progressCallback, lastResumeState);
      
    } catch (error) {
      console.error(`❌ Upload attempt ${attempt} failed:`, error.message);
      
      // Extract resume state if available
      if (error.resumeState) {
        lastResumeState = error.resumeState;
        console.log(`📝 Resume state captured: ${lastResumeState.completedChunks}/${lastResumeState.totalChunks} parts completed`);
      }
      
      if (attempt === maxRetries) {
        // Clean up unfinished upload if possible
        if (lastResumeState?.fileId) {
          try {
            console.log('🧹 Cleaning up unfinished upload...');
            await b2Instance.cancelLargeFile({
              fileId: lastResumeState.fileId
            });
            console.log('✅ Unfinished upload cleaned up');
          } catch (cleanupError) {
            console.warn('⚠️ Could not clean up unfinished upload:', cleanupError.message);
          }
        }
        
        throw error;
      }
      
      // Wait before retry with exponential backoff
      const waitTime = Math.min(2000 * Math.pow(2, attempt - 1), 30000);
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

/**
 * Cancel an unfinished large file upload
 * Useful for cleanup and error recovery
 */
const cancelLargeFileUpload = async (fileId) => {
  try {
    await authorize();
    
    console.log(`🧹 Canceling large file upload: ${fileId}`);
    await b2Instance.cancelLargeFile({
      fileId: fileId
    });
    console.log('✅ Large file upload canceled successfully');
    
    return true;
  } catch (error) {
    console.error('❌ Failed to cancel large file upload:', error.message);
    throw error;
  }
};

/**
 * List unfinished large file uploads for cleanup
 * Helps identify and clean up orphaned uploads
 */
const listUnfinishedUploads = async (bucketId = null) => {
  try {
    await authorize();
    
    const targetBucketId = bucketId || process.env.B2_BUCKET_ID;
    console.log(`📋 Listing unfinished uploads for bucket: ${targetBucketId}`);
    
    const response = await b2Instance.listUnfinishedLargeFiles({
      bucketId: targetBucketId,
      maxFileCount: 100
    });
    
    const unfinishedFiles = response.data.files || [];
    console.log(`📋 Found ${unfinishedFiles.length} unfinished uploads`);
    
    return unfinishedFiles;
  } catch (error) {
    console.error('❌ Failed to list unfinished uploads:', error.message);
    throw error;
  }
};

module.exports = {
  // Main upload functions
  uploadFileOptimized,
  uploadFileWithRetry,
  uploadLargeFileOptimized,
  uploadSmallFileOptimized,
  
  // Utility functions
  cancelLargeFileUpload,
  listUnfinishedUploads,
  authorize,
  
  // Legacy compatibility (deprecated)
  uploadFileInChunks: uploadFileOptimized,
  resumeUpload: uploadFileWithRetry
}; 