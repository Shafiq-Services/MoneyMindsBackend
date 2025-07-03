const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const { uploadFile } = require('../utils/backblazeB2');
const { transcodeToHLS } = require('../utils/ffmpegTranscoder');
const Video = require('../models/video');
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
    } else {
      cb(new Error('Invalid upload endpoint'), false);
    }
  }
});

const uploadImage = async (req, res) => {
  try {
    console.log('🖼️ Starting image upload process...');
    console.log('📁 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      userId: req.userId
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
    const fileName = `images/${imageId}${fileExtension}`;

    try {
      const uploadResult = await uploadFile(fileName, req.file.buffer);
      
      // Structure response according to node-api-structure
      const responseData = {
        _id: imageId,
        imageUrl: uploadResult.fileUrl,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
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

const uploadVideo = async (req, res) => {
  try {
    console.log('🎬 Starting video upload process...');
    console.log('📁 File info:', {
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      userId: req.userId
    });

    if (!req.file) {
      return errorResponse(res, 400, 'No video file provided');
    }

    // Validate file size
    if (req.file.size > 500 * 1024 * 1024) {
      return errorResponse(res, 400, 'File size exceeds 500MB limit');
    }

    // Validate file type
    const allowedVideoTypes = ['video/mp4', 'video/avi', 'video/mov', 'video/wmv', 'video/flv', 'video/webm', 'video/mkv'];
    if (!allowedVideoTypes.includes(req.file.mimetype)) {
      return errorResponse(res, 400, 'Invalid video file type');
    }

    const videoId = uuidv4();

    // Store original video file
    const fileExtension = path.extname(req.file.originalname);
    const originalFileName = `videos/${videoId}/original${fileExtension}`;
    
    // Upload original video file
    console.log('📤 Starting original video upload...');
    const originalUploadResult = await uploadFile(originalFileName, req.file.buffer);
    console.log('✅ Original video upload complete');

    // Create video document with original URL
    const video = await Video.create({
      videoUrl: originalUploadResult.fileUrl, // Temporary URL until transcoding is done
      originalVideoUrl: originalUploadResult.fileUrl,
      type: 'film', // Default type, can be updated later
    });

    // Start transcoding
    try {
      console.log('🔄 Starting video transcoding...');
      const transcodeResult = await transcodeToHLS(req.file.buffer, videoId);
      console.log('✅ Video transcoding complete');
      
      // Update video document with transcoded URL and resolutions
      await Video.findByIdAndUpdate(video._id, {
        videoUrl: transcodeResult.videoUrl,
        resolutions: transcodeResult.resolutions
      });

      // Get updated video document
      const updatedVideo = await Video.findById(video._id);

      // Structure response according to node-api-structure
      const responseData = {
        _id: updatedVideo._id,
        title: updatedVideo.title,
        description: updatedVideo.description,
        type: updatedVideo.type,
        videoUrl: updatedVideo.videoUrl,
        originalVideoUrl: updatedVideo.originalVideoUrl,
        posterUrl: updatedVideo.posterUrl,
        resolutions: updatedVideo.resolutions,
        createdAt: updatedVideo.createdAt
      };

      return successResponse(res, 201, 'Video uploaded and processed successfully', responseData, 'video');
      
    } catch (transcodeError) {
      console.error('❌ Transcoding failed:', transcodeError.message);
      return errorResponse(res, 500, 'Failed to process video', transcodeError.message);
    }
    
  } catch (err) {
    console.error('❌ Upload failed:', err.message);
    return errorResponse(res, 500, 'Failed to upload video', err.message);
  }
};

module.exports = {
  upload,
  uploadImage,
  uploadVideo,
}; 