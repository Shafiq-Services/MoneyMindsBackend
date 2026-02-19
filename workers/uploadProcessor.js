const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { uploadFileSmart } = require('../utils/b2OfficialMultithreaded');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { convertToFullUrl } = require('../utils/urlHelper');
const socketManager = require('../utils/socketManager');
const { 
  updateJobProgress, 
  completeJob, 
  failJob 
} = require('../utils/uploadQueue');

/**
 * Helper function to clean up temporary files
 */
const cleanupTempFile = (filePath) => {
  if (!filePath) return;
  
  try {
    if (fs.existsSync(filePath)) {
      fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Failed to cleanup temp file:', err.message);
        } else {
          console.log('✅ Temp file cleaned up:', path.basename(filePath));
        }
      });
    }
  } catch (error) {
    console.warn('Error during temp file cleanup:', error.message);
  }
};

/**
 * Safe socket manager wrapper
 */
const safeSocketBroadcast = (method, userId, data) => {
  try {
    if (userId && socketManager && typeof socketManager[method] === 'function') {
      socketManager[method](userId, data);
    }
  } catch (error) {
    console.warn(`[Upload Processor] Socket broadcast failed (${method}):`, error.message);
  }
};

/**
 * Get upload folder based on type
 */
const getUploadFolder = (type, uploadType) => {
  if (uploadType === 'video') {
    const videoFolders = {
      'film': 'videos/films',
      'episode': 'videos/episodes', 
      'lesson': 'videos/lessons'
    };
    return videoFolders[type] || 'videos';
  } else if (uploadType === 'image') {
    const imageFolders = {
      'campus': 'images/campuses',
      'course': 'images/courses', 
      'video': 'images/videos',
      'series': 'images/series',
      'book': 'images/books',
      'user': 'images/users',
      'avatar': 'images/avatars',
      'banner': 'images/banners',
      'marketplace': 'images/marketplace',
      'feed': 'images/feeds',
      'chat': 'images/chat',
      'contact': 'files/contact',
      'landing': 'images/landing'
    };
    return imageFolders[type];
  } else if (uploadType === 'file') {
    return 'files';
  }
  return 'uploads';
};

/**
 * Process upload job
 * @param {Object} job - Bull job object
 */
const processUploadJob = async (job) => {
  const { uploadId, userId, uploadType, type, tempFilePath, originalFileName, fileSize } = job.data;
  
  console.log(`🎬 [Upload Processor] Starting job: ${uploadId} (${uploadType})`);
  console.log(`📁 [Upload Processor] File: ${originalFileName} (${(fileSize / 1024 / 1024).toFixed(2)}MB)`);
  
  try {
    // Generate file path for B2
    const fileExt = path.extname(originalFileName).toLowerCase();
    const folder = getUploadFolder(type, uploadType);
    const fileName = uploadType === 'video' 
      ? `${folder}/${uploadId}/original${fileExt}`
      : `${folder}/${uploadId}${fileExt}`;
    
    // Update job status to uploading
    await updateJobProgress(uploadId, {
      stage: 'uploading',
      progress: 0,
      message: `Starting ${uploadType} upload to cloud storage...`
    });
    
    // Broadcast upload start
    safeSocketBroadcast('broadcastUploadProgress', userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      stage: 'uploading',
      progress: 0,
      message: `Starting ${uploadType} upload...`
    });
    
    // Upload file to B2 with progress tracking
    console.log(`📤 [Upload Processor] Uploading to B2: ${fileName}`);
    
    // Calculate timeout based on file size: 30 minutes base + 1 minute per 100MB
    const fileSizeMB = fileSize / (1024 * 1024);
    const uploadTimeout = Math.max(30 * 60 * 1000, 30 * 60 * 1000 + (fileSizeMB / 100) * 60 * 1000);
    const timeoutMinutes = Math.ceil(uploadTimeout / (60 * 1000));
    
    console.log(`⏱️ [Upload Processor] Upload timeout set to ${timeoutMinutes} minutes for ${fileSizeMB.toFixed(2)}MB file`);
    
    const uploadResult = await Promise.race([
      uploadFileSmart(tempFilePath, fileName, async (progressData) => {
        // Update database
        await updateJobProgress(uploadId, {
          stage: 'uploading',
          progress: progressData.progress,
          message: progressData.message || `Uploading ${uploadType}...`,
          uploadSpeed: progressData.uploadSpeed,
          uploadedBytes: progressData.uploadedBytes
        });
        
        // Broadcast to client via socket
        safeSocketBroadcast('broadcastUploadProgress', userId, {
          uploadType,
          uploadId,
          ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
          stage: 'uploading',
          progress: progressData.progress,
          message: progressData.message || `Uploading ${uploadType}...`,
          ...progressData
        });
      }),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`Upload timeout after ${timeoutMinutes} minutes`)), uploadTimeout)
      )
    ]);
    
    console.log(`✅ [Upload Processor] Upload completed: ${uploadResult.fileUrl}`);
    
    let transcodeResult = null;
    
    // Handle video transcoding
    if (uploadType === 'video') {
      await updateJobProgress(uploadId, {
        stage: 'transcoding',
        progress: 0,
        message: 'Starting video transcoding...'
      });
      
      safeSocketBroadcast('broadcastUploadProgress', userId, {
        uploadType,
        uploadId,
        videoType: type,
        stage: 'transcoding',
        progress: 0,
        message: 'Starting video transcoding...'
      });
      
      console.log(`🎬 [Upload Processor] Transcoding video: ${uploadId}`);
      
      // Progress callback for transcoding
      const progressCallback = (progressData) => {
        // Update database
        updateJobProgress(uploadId, {
          stage: 'transcoding',
          progress: progressData.overallProgress,
          message: progressData.message
        }).catch(err => console.warn('Failed to update job progress:', err.message));
        
        // Broadcast to client via socket
        safeSocketBroadcast('broadcastUploadProgress', userId, {
          uploadType,
          uploadId,
          videoType: type,
          stage: 'transcoding',
          progress: progressData.overallProgress,
          message: progressData.message,
          resolution: progressData.resolution,
          resolutionProgress: progressData.resolutionProgress
        });
      };
      
      // Use file path directly instead of loading into memory (memory optimization)
      let videoInput = tempFilePath;
      try {
        // Verify file exists
        if (!fs.existsSync(tempFilePath)) {
          throw new Error('Temp file not found');
        }
      } catch (readErr) {
        console.warn(`⚠️ [Upload Processor] Temp file missing, downloading original from storage: ${readErr.message}`);
        // Fallback: download the just-uploaded original from CDN/B2
        // Note: This still uses buffer, but only as fallback
        const originalUrl = convertToFullUrl(uploadResult.fileUrl);
        const resp = await axios.get(originalUrl, { responseType: 'arraybuffer', timeout: 600000 });
        videoInput = Buffer.from(resp.data);
      }
      
      // Transcoding with extended timeout (2 hours for 4K videos)
      const transcodePromise = transcodeToHLS(videoInput, uploadId, type, progressCallback);
      const transcodeTimeout = 2 * 60 * 60 * 1000; // 2 hours
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Transcoding timeout after 2 hours')), transcodeTimeout)
      );
      
      transcodeResult = await Promise.race([transcodePromise, timeoutPromise]);
      
      await updateJobProgress(uploadId, {
        stage: 'transcoding',
        progress: 100,
        message: 'Video transcoding complete!'
      });
      
      safeSocketBroadcast('broadcastUploadProgress', userId, {
        uploadType,
        uploadId,
        videoType: type,
        stage: 'transcoding',
        progress: 100,
        message: 'Video transcoding complete!'
      });
      
      console.log(`✅ [Upload Processor] Transcoding completed for: ${uploadId}`);
    }
    
    // Prepare result data
    const resultData = uploadType === 'video' ? {
      videoUrl: transcodeResult.videoUrl,
      originalVideoUrl: uploadResult.fileUrl,
      resolutions: transcodeResult.resolutions,
      duration: transcodeResult.duration
    } : uploadType === 'image' ? {
      imageUrl: uploadResult.fileUrl
    } : {
      fileUrl: uploadResult.fileUrl,
      fileName: originalFileName,
      fileSize: fileSize
    };
    
    // Mark job as completed
    await completeJob(uploadId, resultData);
    
    // Prepare response data with full URLs
    const responseData = {
      _id: uploadId,
      ...(uploadType === 'video' ? {
        videoUrl: convertToFullUrl(transcodeResult.videoUrl),
        originalVideoUrl: convertToFullUrl(uploadResult.fileUrl),
        videoType: type,
        resolutions: transcodeResult.resolutions,
        duration: transcodeResult.duration
      } : uploadType === 'image' ? {
        imageUrl: convertToFullUrl(uploadResult.fileUrl),
        imageType: type
      } : {
        fileUrl: convertToFullUrl(uploadResult.fileUrl),
        fileName: originalFileName,
        fileSize: fileSize
      }),
      createdAt: new Date()
    };
    
    // Broadcast completion via socket
    safeSocketBroadcast('broadcastUploadComplete', userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      ...responseData
    });
    
    // Cleanup temp file
    cleanupTempFile(tempFilePath);
    
    console.log(`🎉 [Upload Processor] Job completed successfully: ${uploadId}`);
    
    return {
      success: true,
      uploadId,
      ...responseData
    };
    
  } catch (error) {
    console.error(`❌ [Upload Processor] Job failed: ${uploadId}`, error.message);
    console.error(`❌ [Upload Processor] Error stack:`, error.stack);
    
    // Mark job as failed
    await failJob(uploadId, error);
    
    // Broadcast error
    safeSocketBroadcast('broadcastUploadError', userId, {
      uploadType,
      uploadId,
      ...(type && { [uploadType === 'video' ? 'videoType' : 'imageType']: type }),
      error: error.message,
      stage: 'error'
    });
    
    // Cleanup temp file
    try {
      cleanupTempFile(tempFilePath);
    } catch (cleanupError) {
      console.warn('Failed to cleanup temp file:', cleanupError.message);
    }
    
    throw error;
  }
};

module.exports = {
  processUploadJob
};


