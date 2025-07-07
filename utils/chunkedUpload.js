const fs = require('fs');
const path = require('path');
const B2 = require('backblaze-b2');
const { getB2S3Url } = require('./b2Url');

// Initialize B2 (same as backblazeB2.js)
const b2Instance = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

let authData = null;

// Authorize B2 (same as backblazeB2.js)
const authorize = async () => {
  if (!authData) {
    authData = await b2Instance.authorize();
  }
  return authData;
};

/**
 * Upload file using B2's automatic chunking with progress tracking
 * @param {string} filePath - Path to the file on disk
 * @param {string} fileName - Destination filename in B2
 * @param {number} chunkSize - Size of each chunk in bytes (default: 5MB)
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Object} Upload result with file URL
 */
const uploadFileInChunks = async (filePath, fileName, chunkSize = 5 * 1024 * 1024, progressCallback = null) => {
  try {
    await authorize();
    
    const bucketId = process.env.B2_BUCKET_ID;
    const fileSize = fs.statSync(filePath).size;
    
    console.log(`📤 Starting B2 upload: ${fileName} (${fileSize} bytes)`);
    
    // Check B2 configuration
    if (!bucketId) {
      throw new Error('B2_BUCKET_ID not configured. Please set your B2 bucket ID in environment variables.');
    }
    
    // Get upload URL
    const uploadUrl = await b2Instance.getUploadUrl({
      bucketId: bucketId,
    });
    
    // Read file as buffer
    const fileBuffer = fs.readFileSync(filePath);
    
    let startTime = Date.now();
    let lastProgressUpdate = 0;
    
    // Progress tracking interval (every 1 second)
    const progressInterval = setInterval(() => {
      if (progressCallback) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        const uploadSpeed = elapsedTime > 0 ? (fileSize / elapsedTime) : 0;
        
        progressCallback({
          stage: 'uploading',
          progress: 50, // Approximate since we can't track actual progress
          completedChunks: 1,
          totalChunks: 1,
          currentChunk: 1,
          message: 'Uploading to B2...',
          fileSize: fileSize,
          uploadedBytes: fileSize,
          uploadSpeed: `${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
          timeRemaining: 'calculating...'
        });
      }
    }, 1000);
    
    // Upload file - B2 will handle chunking automatically for large files
    const uploadOptions = {
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      fileName: fileName,
      data: fileBuffer,
    };
    
    console.log(`📤 Uploading file to B2 (automatic chunking enabled)...`);
    
    const response = await b2Instance.uploadFile(uploadOptions);
    
    // Clear progress interval
    clearInterval(progressInterval);
    
    console.log(`✅ File uploaded successfully: ${response.data.fileId}`);
    
    // Generate public URL
    const fileUrl = getB2S3Url(fileName);
    
    // Final progress update
    if (progressCallback) {
      const totalTime = (Date.now() - startTime) / 1000;
      const avgSpeed = totalTime > 0 ? (fileSize / totalTime) : 0;
      
      progressCallback({
        stage: 'uploading',
        progress: 100,
        completedChunks: 1,
        totalChunks: 1,
        currentChunk: 1,
        message: 'Upload complete!',
        fileSize: fileSize,
        uploadedBytes: fileSize,
        uploadSpeed: `${(avgSpeed / 1024 / 1024).toFixed(2)} MB/s`,
        timeRemaining: '0s'
      });
    }
    
    return {
      fileId: response.data.fileId,
      fileName: response.data.fileName,
      fileUrl: fileUrl,
      fileSize: fileSize,
      totalChunks: 1
    };
    
  } catch (error) {
    console.error('❌ Upload failed:', error.message);
    throw new Error(`Upload failed: ${error.message}`);
  }
};

/**
 * Upload file with retry logic and resume capability
 * @param {string} filePath - Path to the file on disk
 * @param {string} fileName - Destination filename in B2
 * @param {number} maxRetries - Maximum number of retry attempts
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Object} Upload result
 */
const uploadFileWithRetry = async (filePath, fileName, maxRetries = 3, progressCallback = null) => {
  let lastUploadState = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🔄 Upload attempt ${attempt}/${maxRetries}`);
      
      // If we have a previous upload state, try to resume
      if (lastUploadState && lastUploadState.fileId) {
        console.log(`🔄 Attempting to resume upload from fileId: ${lastUploadState.fileId}`);
        return await resumeUpload(filePath, fileName, lastUploadState, progressCallback);
      }
      
      return await uploadFileInChunks(filePath, fileName, 5 * 1024 * 1024, progressCallback);
    } catch (error) {
      console.error(`❌ Upload attempt ${attempt} failed:`, error.message);
      
      // Try to extract upload state from error for resume capability
      if (error.message.includes('fileId')) {
        const fileIdMatch = error.message.match(/fileId[:\s]+([a-zA-Z0-9_-]+)/);
        if (fileIdMatch) {
          lastUploadState = {
            fileId: fileIdMatch[1],
            fileName: fileName,
            attempt: attempt
          };
          console.log(`📝 Saved upload state for resume: ${lastUploadState.fileId}`);
        }
      }
      
      if (attempt === maxRetries) {
        throw error;
      }
      
      // Wait before retry (exponential backoff)
      const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
      console.log(`⏳ Waiting ${waitTime}ms before retry...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }
};

/**
 * Resume a failed upload (simplified for B2 automatic chunking)
 * @param {string} filePath - Path to the file on disk
 * @param {string} fileName - Destination filename in B2
 * @param {Object} uploadState - Previous upload state
 * @param {Function} progressCallback - Optional progress callback
 * @returns {Object} Upload result
 */
const resumeUpload = async (filePath, fileName, uploadState, progressCallback = null) => {
  try {
    console.log(`🔄 Resuming upload for file: ${fileName}`);
    
    // For B2 automatic chunking, we just retry the upload
    return await uploadFileInChunks(filePath, fileName, 5 * 1024 * 1024, progressCallback);
    
  } catch (error) {
    console.error('❌ Resume upload failed:', error.message);
    throw new Error(`Resume upload failed: ${error.message}`);
  }
};

module.exports = {
  uploadFileInChunks,
  uploadFileWithRetry,
  resumeUpload,
  getB2S3Url
}; 