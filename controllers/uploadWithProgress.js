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

// Helper function to get video folder based on type
const getVideoFolder = (videoType) => {
  const videoFolders = {
    'film': 'videos/films',
    'episode': 'videos/episodes', 
    'lesson': 'videos/lessons'
  };
  return videoFolders[videoType] || 'videos/films';
};

// Helper function to validate video type
const validateVideoType = (videoType) => {
  const validTypes = ['film', 'episode', 'lesson'];
  return validTypes.includes(videoType);
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

const uploadVideoWithProgress = async (req, res) => {
  try {
    console.log('🎬 Starting video upload with progress...');
    
    // Check for video type in query parameter
    const videoType = req.query.type;
    if (!videoType) {
      return errorResponse(res, 400, 'Video type is required. Use query parameter: ?type=film|episode|lesson');
    }
    
    if (!validateVideoType(videoType)) {
      return errorResponse(res, 400, 'Invalid video type. Valid types: film, episode, lesson');
    }

    // File validation
    if (!req.file) {
      return errorResponse(res, 400, 'No video file provided');
    }

    if (req.file.size > 2 * 1024 * 1024 * 1024) { // 2GB limit
      return errorResponse(res, 400, 'Video file too large. Maximum size is 2GB');
    }

    // Validate video file type
    const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
    if (!allowedVideoTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, 'Invalid video file type');
    }

    const videoId = uuidv4();
    const fileExtension = path.extname(req.file.originalname).toLowerCase();

    // Emit upload start event
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.emitToUser(req.userId, 'video-upload-start', {
        videoId,
        videoType,
        originalFileName: req.file.originalname,
        fileSize: req.file.size
      });
    }

    // Store original video file with organized folder structure
    const videoFolder = getVideoFolder(videoType);
    const originalFileName = `${videoFolder}/${videoId}/original${fileExtension}`;

    // Upload original video file
    console.log('📤 Starting original video upload...');
    if (socketManager) {
      socketManager.emitToUser(req.userId, 'video-upload-progress', {
        videoId,
        videoType,
        stage: 'uploading',
        progress: 0,
        message: 'Uploading original video...'
      });
    }

    const originalUploadResult = await uploadFile(originalFileName, req.file.buffer);
    console.log('✅ Original video upload complete');

    if (socketManager) {
      socketManager.emitToUser(req.userId, 'video-upload-progress', {
        videoId,
        videoType,
        stage: 'uploading',
        progress: 50,
        message: 'Original video uploaded successfully'
      });
    }

    // Transcode video to HLS with organized folder structure
    try {
      console.log('🔄 Starting video transcoding...');
      if (socketManager) {
        socketManager.emitToUser(req.userId, 'video-upload-progress', {
          videoId,
          videoType,
          stage: 'transcoding',
          progress: 60,
          message: 'Starting video transcoding...'
        });
      }

      const transcodeResult = await transcodeToHLS(req.file.buffer, videoId, videoType);
      console.log('✅ Video transcoding complete');

      if (socketManager) {
        socketManager.emitToUser(req.userId, 'video-upload-complete', {
          videoId,
          videoType,
          videoUrl: transcodeResult.videoUrl,
          originalVideoUrl: originalUploadResult.fileUrl,
          resolutions: transcodeResult.resolutions,
          duration: transcodeResult.duration,
          createdAt: new Date()
        });
      }

      // Response data
      const responseData = {
        _id: videoId,
        videoUrl: transcodeResult.videoUrl,
        originalVideoUrl: originalUploadResult.fileUrl,
        videoType: videoType,
        createdAt: new Date()
      };

      return successResponse(res, 201, 'Video uploaded and processed successfully', responseData, 'video');

    } catch (transcodeError) {
      console.error('❌ Video transcoding failed:', transcodeError);
      
      if (socketManager) {
        socketManager.emitToUser(req.userId, 'video-upload-error', {
          videoId,
          videoType,
          error: transcodeError.message,
          stage: 'transcoding'
        });
      }

      return errorResponse(res, 500, 'Failed to process video', transcodeError.message);
    }

  } catch (err) {
    console.error('❌ Video upload failed:', err);
    
    const socketManager = req.app.get('socketManager');
    if (socketManager) {
      socketManager.emitToUser(req.userId, 'video-upload-error', {
        videoId: req.body.videoId || 'unknown',
        videoType: req.query.type || 'unknown',
        error: err.message,
        stage: 'upload'
      });
    }

    return errorResponse(res, 500, 'Failed to upload video', err.message);
  }
};

module.exports = {
  uploadImageWithProgress,
  uploadVideoWithProgress,
}; 