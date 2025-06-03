const busboy = require('busboy');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { ProgressTracker, getProgress } = require('../utils/progressTracker');
const socketManager = require('../utils/socketManager');

const uploadImageWithProgress = (req, res) => {
  const imageId = uuidv4();
  const progressTracker = new ProgressTracker(imageId, 'image', socketManager);

  try {
    const bb = busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB for images
      }
    });

    let uploadPromise = null;
    let fileBuffer = Buffer.alloc(0);
    let totalSize = 0;
    let uploadedBytes = 0;
    let fileName = '';
    let fileExtension = '';

    bb.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      
      // Validate file type
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedImageTypes.includes(mimeType)) {
        progressTracker.fail(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'));
        return res.status(400).json({ status: false, message: 'Invalid file type' });
      }

      fileExtension = path.extname(filename);
      fileName = `images/${imageId}${fileExtension}`;

      // Track real upload progress
      file.on('data', (chunk) => {
        fileBuffer = Buffer.concat([fileBuffer, chunk]);
        uploadedBytes += chunk.length;
        
        if (totalSize > 0) {
          const uploadProgress = Math.round((uploadedBytes / totalSize) * 100);
          progressTracker.updateUploadProgress(uploadProgress);
        }
      });

      file.on('end', async () => {
        progressTracker.updateUploadProgress(100);
        
        try {
          // Upload to B2
          const uploadResult = await uploadFile(fileName, fileBuffer);
          
          const result = {
            imageUrl: uploadResult.fileUrl,
            fileId: uploadResult.fileId,
            fileName: uploadResult.fileName,
          };
          
          progressTracker.complete(result);
          
        } catch (error) {
          progressTracker.fail(error);
        }
      });
    });

    bb.on('field', (fieldname, val) => {
      if (fieldname === 'totalSize') {
        totalSize = parseInt(val);
      }
    });

    bb.on('error', (err) => {
      progressTracker.fail(err);
      res.status(400).json({ status: false, message: err.message });
    });

    bb.on('finish', () => {
      res.status(202).json({
        status: true,
        message: 'Image upload initiated',
        progressId: imageId,
        imageId: imageId
      });
    });

    req.pipe(bb);

  } catch (err) {
    progressTracker.fail(err);
    return res.status(500).json({
      status: false,
      message: 'Failed to initiate image upload',
      error: err.message,
    });
  }
};

const uploadVideoWithProgress = (req, res) => {
  const videoId = uuidv4();
  const progressTracker = new ProgressTracker(videoId, 'video', socketManager);

  try {
    const bb = busboy({ 
      headers: req.headers,
      limits: {
        fileSize: 500 * 1024 * 1024, // 500MB for videos
      }
    });

    let fileBuffer = Buffer.alloc(0);
    let totalSize = 0;
    let uploadedBytes = 0;
    let fileName = '';

    bb.on('file', (fieldname, file, info) => {
      const { filename, mimeType } = info;
      
      // Validate file type
      const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
      if (!allowedVideoTypes.includes(mimeType)) {
        progressTracker.fail(new Error('Only video files are allowed'));
        return res.status(400).json({ status: false, message: 'Invalid file type' });
      }

      fileName = filename;

      // Track real upload progress
      file.on('data', (chunk) => {
        fileBuffer = Buffer.concat([fileBuffer, chunk]);
        uploadedBytes += chunk.length;
        
        if (totalSize > 0) {
          const uploadProgress = Math.round((uploadedBytes / totalSize) * 100);
          progressTracker.updateUploadProgress(uploadProgress);
        }
      });

      file.on('end', async () => {
        progressTracker.updateUploadProgress(100);
        
        try {
          // Start transcoding with real progress
          const transcodeResult = await transcodeToHLS(fileBuffer, videoId, progressTracker);
          
          progressTracker.complete({
            videoUrl: transcodeResult.videoUrl,
            resolutions: transcodeResult.resolutions,
            duration: transcodeResult.duration,
            videoId: videoId,
            originalFileName: fileName,
            fileSize: uploadedBytes
          });
          
          console.log(`Video ${videoId} processed successfully:`, transcodeResult);
          
        } catch (transcodeError) {
          console.error(`Video ${videoId} processing failed:`, transcodeError.message);
          progressTracker.fail(transcodeError);
        }
      });
    });

    bb.on('field', (fieldname, val) => {
      if (fieldname === 'totalSize') {
        totalSize = parseInt(val);
      }
    });

    bb.on('error', (err) => {
      progressTracker.fail(err);
      res.status(400).json({ status: false, message: err.message });
    });

    bb.on('finish', () => {
      res.status(202).json({
        status: true,
        message: 'Video upload initiated. Processing will complete shortly.',
        videoId: videoId,
        progressId: videoId,
        processingStatus: 'in_progress',
      });
    });

    req.pipe(bb);

  } catch (err) {
    progressTracker.fail(err);
    return res.status(500).json({
      status: false,
      message: 'Failed to initiate video upload',
      error: err.message,
    });
  }
};

const getUploadProgress = async (req, res) => {
  try {
    const { progressId } = req.params;

    if (!progressId) {
      return res.status(400).json({ status: false, message: 'Progress ID is required' });
    }

    const progress = getProgress(progressId);
    
    if (!progress) {
      return res.status(404).json({ 
        status: false, 
        message: 'Progress not found or upload has been completed and cleaned up' 
      });
    }

    return res.status(200).json({
      status: true,
      message: 'Progress retrieved successfully',
      progress: progress
    });

  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Failed to get upload progress',
      error: err.message,
    });
  }
};

module.exports = {
  uploadImageWithProgress,
  uploadVideoWithProgress,
  getUploadProgress,
}; 