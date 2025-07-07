const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// Configure multer for memory storage
const storage = multer.memoryStorage();

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB limit for large files
  },
  fileFilter: (req, file, cb) => {
    if (req.path.includes('/image')) {
      // Image upload validation
      const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (allowedImageTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only image files (JPEG, PNG, GIF, WebP) are allowed'), false);
      }
    } else if (req.path.includes('/video')) {
      // Video upload validation
      const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
      if (allowedVideoTypes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Only video files (MP4, AVI, MOV, WMV, FLV, WebM, MKV) are allowed'), false);
      }
    } else if (req.path.includes('/file')) {
      // Allow any file type for /file endpoint
      cb(null, true);
    } else {
      cb(new Error('Invalid upload endpoint'), false);
    }
  }
});

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
    'chat': 'images/chat',
    'contact': 'files/contact'
  };
  
  return folderMap[type] || 'images'; // Default to 'images' if type not found
};

// Helper function to validate image type
const validateImageType = (type) => {
  const validTypes = [
    'campus', 'course', 'video', 'series', 'book', 
    'user', 'avatar', 'banner', 'marketplace', 'feed', 'chat', 'contact'
  ];
  
  return validTypes.includes(type);
};

const uploadImage = async (req, res) => {
  try {
    console.log('🖼️ Starting image upload process...');
    
    // Get and validate the type query parameter
    const { type } = req.query;
    
    if (!type) {
      return errorResponse(res, 400, 'Image type is required. Use query parameter: ?type=campus|course|video|series|book|user|avatar|banner|marketplace|feed|chat');
    }
    
    if (!validateImageType(type)) {
      return errorResponse(res, 400, 'Invalid image type. Valid types: campus, course, video, series, book, user, avatar, banner, marketplace, feed, chat');
    }
    
    console.log('📁 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      userId: req.userId,
      imageType: type
    });

    if (!req.file) {
      return errorResponse(res, 400, 'No image file provided');
    }

    // Validate file size (10MB limit for images)
    if (req.file.size > 10 * 1024 * 1024) {
      return errorResponse(res, 400, 'File size exceeds 10MB limit');
    }

    // Validate file type
    const allowedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedImageTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, 'Invalid image file type');
    }

    const imageId = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const folderPath = getImageFolder(type);
    const fileName = `${folderPath}/${imageId}${fileExtension}`;

    try {
      const uploadResult = await uploadFile(fileName, req.file.buffer);
      
      // Structure response according to node-api-structure
      const responseData = {
        _id: imageId,
        imageUrl: uploadResult.fileUrl,
        imageType: type,
        createdAt: new Date()
      };

      return successResponse(res, 201, 'Image uploaded successfully', responseData, 'image');

    } catch (error) {
      throw error;
    }

  } catch (err) {
    return errorResponse(res, 500, 'Failed to upload image', err.message);
  }
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

const uploadVideo = async (req, res) => {
  try {
    console.log('🎬 Starting video upload to storage...');
    
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

    // Store original video file with organized folder structure
    const videoFolder = getVideoFolder(videoType);
    const originalFileName = `${videoFolder}/${videoId}/original${fileExtension}`;

    // Upload original video file
    console.log('📤 Starting original video upload...');
    const originalUploadResult = await uploadFile(originalFileName, req.file.buffer);
    console.log('✅ Original video upload complete');

    // Transcode video to HLS with organized folder structure
    try {
      console.log('🔄 Starting video transcoding...');
      const transcodeResult = await transcodeToHLS(req.file.buffer, videoId, videoType);
      console.log('✅ Video transcoding complete');

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
      return errorResponse(res, 500, 'Failed to process video', transcodeError.message);
    }

  } catch (err) {
    console.error('❌ Video upload failed:', err);
    return errorResponse(res, 500, 'Failed to upload video', err.message);
  }
};

const uploadGeneralFile = async (req, res) => {
  try {
    console.log('📎 Starting file upload process...');
    
    // Get and validate the type query parameter
    const { type } = req.query;
    
    if (!type) {
      return errorResponse(res, 400, 'File type is required. Use query parameter: ?type=contact|document|other');
    }
    
    console.log('📁 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size
    });

    if (!req.file) {
      return errorResponse(res, 400, 'No file provided');
    }

    // Validate file size (50MB limit for files)
    if (req.file.size > 50 * 1024 * 1024) {
      return errorResponse(res, 400, 'File size exceeds 50MB limit');
    }

    // Accept any file type - no restrictions
    console.log('📄 File type:', req.file.mimetype);

    const fileId = uuidv4();
    const fileExtension = path.extname(req.file.originalname);
    const folderPath = `files/${type}`;
    const fileName = `${folderPath}/${fileId}${fileExtension}`;

    try {
      const uploadResult = await uploadFile(fileName, req.file.buffer);
      
      // Structure response according to node-api-structure
      const responseData = {
        _id: fileId,
        fileUrl: uploadResult.fileUrl,
        fileName: req.file.originalname,
        fileType: req.file.mimetype,
        fileSize: req.file.size,
        folderPath: folderPath,
        createdAt: new Date()
      };

      return successResponse(res, 201, 'File uploaded successfully', responseData, 'file');

    } catch (error) {
      throw error;
    }

  } catch (err) {
    return errorResponse(res, 500, 'Failed to upload file', err.message);
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
  uploadGeneralFile,
}; 