const busboy = require('busboy');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const socketManager = require('../utils/socketManager');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// Helper function to get the folder path based on image type
const getImageFolder = (type) => {
  const folderMap = {
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
    'chat': 'images/chat'
  };
  
  return folderMap[type] || 'images'; // Default to 'images' if type not found
};

// Helper function to validate image type
const validateImageType = (type) => {
  const validTypes = [
    'campus', 'course', 'video', 'series', 'book', 
    'user', 'avatar', 'banner', 'marketplace', 'feed', 'chat'
  ];
  
  return validTypes.includes(type);
};

const uploadImageWithProgress = (req, res) => {
  const imageId = uuidv4();

  try {
    // Get and validate the type query parameter
    const { type } = req.query;
    
    if (!type) {
      return errorResponse(res, 400, 'Image type is required. Use query parameter: ?type=campus|course|video|series|book|user|avatar|banner|marketplace|feed|chat');
    }
    
    if (!validateImageType(type)) {
      return errorResponse(res, 400, 'Invalid image type. Valid types: campus, course, video, series, book, user, avatar, banner, marketplace, feed, chat');
    }

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
        return errorResponse(res, 400, 'Invalid file type');
      }

      fileExtension = path.extname(filename);
      const folderPath = getImageFolder(type);
      fileName = `${folderPath}/${imageId}${fileExtension}`;

      // Track real upload progress
      file.on('data', (chunk) => {
        fileBuffer = Buffer.concat([fileBuffer, chunk]);
        uploadedBytes += chunk.length;
        
        if (totalSize > 0) {
          const uploadProgress = Math.round((uploadedBytes / totalSize) * 100);
          // Emit progress via socket
          if (socketManager.io) {
            socketManager.io.emit('uploadProgress', {
              id: imageId,
              type: 'image',
              imageType: type,
              folderPath: folderPath,
              status: 'uploading',
              uploadProgress: uploadProgress,
              overallProgress: uploadProgress,
              message: `Uploading ${type} image... ${uploadProgress}%`
            });
          }
        }
      });

      file.on('end', async () => {
        // Emit upload complete
        if (socketManager.io) {
          socketManager.io.emit('uploadProgress', {
            id: imageId,
            type: 'image',
            imageType: type,
            folderPath: folderPath,
            status: 'uploading',
            uploadProgress: 100,
            overallProgress: 100,
            message: 'Upload complete, processing...'
          });
        }
        
        try {
          // Upload to B2
          const uploadResult = await uploadFile(fileName, fileBuffer);
          
          const result = {
            imageUrl: uploadResult.fileUrl,
            fileId: uploadResult.fileId,
            imageType: type
          };
          
          // Emit completion
          if (socketManager.io) {
            socketManager.io.emit('uploadProgress', {
              id: imageId,
              type: 'image',
              imageType: type,
              folderPath: folderPath,
              status: 'completed',
              uploadProgress: 100,
              overallProgress: 100,
              message: `${type.charAt(0).toUpperCase() + type.slice(1)} image uploaded successfully`,
              result: result
            });
          }
          
        } catch (error) {
          // Emit error
          if (socketManager.io) {
            socketManager.io.emit('uploadProgress', {
              id: imageId,
              type: 'image',
              imageType: type,
              folderPath: folderPath,
              status: 'failed',
              message: `Failed: ${error.message}`,
              error: error.message
            });
          }
        }
      });
    });

    bb.on('field', (fieldname, val) => {
      if (fieldname === 'totalSize') {
        totalSize = parseInt(val);
      }
    });

    bb.on('error', (err) => {
      if (socketManager.io) {
        socketManager.io.emit('uploadProgress', {
          id: imageId,
          type: 'image',
          imageType: type,
          status: 'failed',
          message: `Failed: ${err.message}`,
          error: err.message
        });
      }
      errorResponse(res, 400, err.message);
    });

    bb.on('finish', () => {
      res.status(202).json({
        status: true,
        message: `${type.charAt(0).toUpperCase() + type.slice(1)} image upload initiated`,
        progressId: imageId,
        imageId: imageId,
        imageType: type
      });
    });

    req.pipe(bb);

  } catch (err) {
    if (socketManager.io) {
      socketManager.io.emit('uploadProgress', {
        id: imageId,
        type: 'image',
        status: 'failed',
        message: `Failed: ${err.message}`,
        error: err.message
      });
    }
    return errorResponse(res, 500, 'Failed to initiate image upload', err.message);
  }
};

const uploadVideoWithProgress = (req, res) => {
  const videoId = uuidv4();

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
        return errorResponse(res, 400, 'Invalid file type');
      }

      fileName = filename;

      // Track real upload progress
      file.on('data', (chunk) => {
        fileBuffer = Buffer.concat([fileBuffer, chunk]);
        uploadedBytes += chunk.length;
        
        if (totalSize > 0) {
          const uploadProgress = Math.round((uploadedBytes / totalSize) * 100);
          // Emit progress via socket
          if (socketManager.io) {
            socketManager.io.emit('uploadProgress', {
              id: videoId,
              type: 'video',
              status: 'uploading',
              uploadProgress: uploadProgress,
              overallProgress: uploadProgress * 0.3, // Upload is 30% of total
              message: `Uploading... ${uploadProgress}%`
            });
          }
        }
      });

      file.on('end', async () => {
        // Emit upload complete, transcoding starting
        if (socketManager.io) {
          socketManager.io.emit('uploadProgress', {
            id: videoId,
            type: 'video',
            status: 'transcoding',
            uploadProgress: 100,
            transcodingProgress: 0,
            overallProgress: 30,
            message: 'Starting video transcoding...'
          });
        }
        
        try {
          // Start transcoding
          const transcodeResult = await transcodeToHLS(fileBuffer, videoId);
          
          // Emit completion
          if (socketManager.io) {
            socketManager.io.emit('uploadProgress', {
              id: videoId,
              type: 'video',
              status: 'completed',
              uploadProgress: 100,
              transcodingProgress: 100,
              overallProgress: 100,
              message: 'Upload and processing completed successfully',
              result: {
                videoUrl: transcodeResult.videoUrl,
                resolutions: transcodeResult.resolutions,
                duration: transcodeResult.duration,
                videoId: videoId,
                originalFileName: fileName,
                fileSize: uploadedBytes
              }
            });
          }
          
          console.log(`Video ${videoId} processed successfully:`, transcodeResult);
          
        } catch (transcodeError) {
          console.error(`Video ${videoId} processing failed:`, transcodeError.message);
          // Emit error
          if (socketManager.io) {
            socketManager.io.emit('uploadProgress', {
              id: videoId,
              type: 'video',
              status: 'failed',
              message: `Failed: ${transcodeError.message}`,
              error: transcodeError.message
            });
          }
        }
      });
    });

    bb.on('field', (fieldname, val) => {
      if (fieldname === 'totalSize') {
        totalSize = parseInt(val);
      }
    });

    bb.on('error', (err) => {
      if (socketManager.io) {
        socketManager.io.emit('uploadProgress', {
          id: videoId,
          type: 'video',
          status: 'failed',
          message: `Failed: ${err.message}`,
          error: err.message
        });
      }
      errorResponse(res, 400, err.message);
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
    if (socketManager.io) {
      socketManager.io.emit('uploadProgress', {
        id: videoId,
        type: 'video',
        status: 'failed',
        message: `Failed: ${err.message}`,
        error: err.message
      });
    }
    return errorResponse(res, 500, 'Failed to initiate video upload', err.message);
  }
};

module.exports = {
  uploadImageWithProgress,
  uploadVideoWithProgress,
}; 