const mongoose = require('mongoose');
const Lesson = require('../models/lesson');
const Module = require('../models/module');
const Course = require('../models/course');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');
const { addVideoResolutions, fetchResolutionsFromVideoUrl } = require('../utils/videoResolutions');
const { calculateVideoDuration } = require('../utils/videoDuration');
const { addProgressToItem } = require('../utils/progressHelper');
const { convertToFullUrl } = require('../utils/urlHelper');

const createLesson = async (req, res) => {
  try {
    const { moduleId, name, videoUrl, text, notes } = req.body;

    if (!moduleId || !name) {
      return errorResponse(res, 400, 'Module ID and name are required');
    }

    // Validate that either videoUrl or text is provided
    if (!videoUrl && !text) {
      return errorResponse(res, 400, 'Either videoUrl or text must be provided for a lesson');
    }

    // Verify module exists and get course info (admin operation - no membership check required)
    const module = await Module.findById(moduleId).populate({
      path: 'courseId',
      populate: {
        path: 'campusId',
        select: 'title'
      }
    });
    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    let resolutions = [];
    let videoDuration = 0;

    // Only process video-related data if videoUrl is provided
    if (videoUrl) {
      // Fetch resolutions from video URL and store them
      console.log('🎬 Fetching resolutions for lesson:', name);
      resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
      console.log('📊 Resolutions found:', resolutions);

      // Calculate video duration automatically
      console.log('📏 Calculating video duration for lesson:', name);
      videoDuration = await calculateVideoDuration(videoUrl);
      console.log('⏱️ Video duration calculated:', videoDuration, 'seconds');
    }

    const lesson = await Lesson.create({
      moduleId,
      name,
      videoUrl: videoUrl || '',
      text: text || '',
      notes: notes || '',
      resolutions: resolutions,
      length: videoDuration
    });

    // Broadcast new lesson release to campus members
    await socketManager.broadcastNewLessonRelease(
      lesson,
      module.courseId.title,
      module.courseId.campusId._id,
      module.courseId.campusId.title
    );

    // Structure response in organized format with resolutions and progress
    const lessonWithResolutions = addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId,
      courseId: module.courseId._id,
      campusId: module.courseId.campusId._id,
      name: lesson.name,
      videoUrl: convertToFullUrl(lesson.videoUrl),
      text: lesson.text,
      notes: lesson.notes || '',
      resolutions: lesson.resolutions || [],
      length: lesson.length || 0,
      createdAt: lesson.createdAt
    });

    const responseData = addProgressToItem(req.userId, lessonWithResolutions);

    return successResponse(res, 201, 'Lesson created successfully', responseData, 'lesson');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to create lesson', error.message);
  }
};

const editLesson = async (req, res) => {
  try {
    const { lessonId } = req.query;
    const { name, videoUrl, text, notes } = req.body;

    if (!lessonId) {
      return errorResponse(res, 400, 'Lesson ID is required');
    }

    const lesson = await Lesson.findById(lessonId).populate({
      path: 'moduleId',
      populate: {
        path: 'courseId'
      }
    });
    if (!lesson) {
      return errorResponse(res, 404, 'Lesson not found');
    }

    // Admin operation - no membership check required
    if (name) lesson.name = name;
    if (notes !== undefined) lesson.notes = notes || ''; // Ensure notes is always a string, never null
    if (text !== undefined) lesson.text = text || ''; // Handle text field

    // Handle videoUrl changes
    if (videoUrl !== undefined) {
      lesson.videoUrl = videoUrl || '';
      
      if (videoUrl) {
        // If video URL is provided, fetch new resolutions and calculate duration
        console.log('🎬 Video URL changed, fetching new resolutions for lesson:', lesson.name);
        const resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
        console.log('📊 New resolutions found:', resolutions);
        lesson.resolutions = resolutions;
        
        // Calculate new video duration
        console.log('📏 Recalculating video duration for lesson:', lesson.name);
        const videoDuration = await calculateVideoDuration(videoUrl);
        console.log('⏱️ New video duration calculated:', videoDuration, 'seconds');
        lesson.length = videoDuration;
      } else {
        // If video URL is removed, clear resolutions and length
        lesson.resolutions = [];
        lesson.length = 0;
      }
    }

    // Validate that either videoUrl or text is provided after all updates
    if (!lesson.videoUrl && !lesson.text) {
      return errorResponse(res, 400, 'Either videoUrl or text must be provided for a lesson');
    }
    
    await lesson.save();

    // Structure response in organized format with resolutions and progress
    const lessonWithResolutions = addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId._id,
      courseId: lesson.moduleId.courseId._id,
      campusId: lesson.moduleId.courseId.campusId,
      name: lesson.name,
      videoUrl: convertToFullUrl(lesson.videoUrl),
      text: lesson.text,
      notes: lesson.notes || '', // Ensure notes is always a string
      resolutions: lesson.resolutions || [],
      length: lesson.length || 0,
      createdAt: lesson.createdAt
    });

    const responseData = addProgressToItem(req.userId, lessonWithResolutions);

    return successResponse(res, 200, 'Lesson updated successfully', responseData, 'lesson');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update lesson', error.message);
  }
};

const deleteLesson = async (req, res) => {
  try {
    const { lessonId } = req.query;

    if (!lessonId) {
      return errorResponse(res, 400, 'Lesson ID is required');
    }

    const lesson = await Lesson.findById(lessonId);
    if (!lesson) {
      return errorResponse(res, 404, 'Lesson not found');
    }

    // Admin operation - no membership check required
    await Lesson.findByIdAndDelete(lessonId);
    return successResponse(res, 200, 'Lesson deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete lesson', error.message);
  }
};

const listLessonsByModule = async (req, res) => {
  try {
    const { moduleId } = req.query;
    const userId = req.userId;

    if (!moduleId) {
      return errorResponse(res, 400, 'Module ID is required');
    }

    // Find the module and its course to check campus membership
    const module = await Module.findById(moduleId).populate('courseId');
    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    // Check if user is a member of the campus
    const { campus, isMember } = await getCampusWithMembershipCheck(module.courseId.campusId, userId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view lessons');
    }

    const lessons = await Lesson.find({ moduleId }).populate('moduleId', 'name');
    
    // Structure response in organized format with resolutions and progress
    const structuredLessons = lessons.map(lesson => {
      const lessonWithResolutions = addVideoResolutions({
        _id: lesson._id,
        moduleId: lesson.moduleId._id,
        courseId: module.courseId._id,
        campusId: module.courseId.campusId,
        name: lesson.name,
        videoUrl: convertToFullUrl(lesson.videoUrl),
        text: lesson.text || '', // Include text field
        notes: lesson.notes || '', // Ensure notes is always a string
        resolutions: lesson.resolutions || [],
        length: lesson.length || 0,
        createdAt: lesson.createdAt
      });
      
      return addProgressToItem(userId, lessonWithResolutions);
    });

    return successResponse(res, 200, 'Lessons retrieved successfully', structuredLessons, 'lessons');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve lessons', error.message);
  }
};

const getLessonById = async (req, res) => {
  try {
    const { lessonId } = req.query;
    const userId = req.userId;

    if (!lessonId) {
      return errorResponse(res, 400, 'Lesson ID is required');
    }

    const lesson = await Lesson.findById(lessonId)
      .populate({
        path: 'moduleId',
        populate: {
          path: 'courseId'
        }
      });
    
    if (!lesson) {
      return errorResponse(res, 404, 'Lesson not found');
    }

    // Check if user is a member of the campus
    const { campus, isMember } = await getCampusWithMembershipCheck(lesson.moduleId.courseId.campusId, userId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view this lesson');
    }

    // Structure response in organized format with resolutions and progress
    const lessonWithResolutions = await addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId._id,
      courseId: lesson.moduleId.courseId._id,
      campusId: lesson.moduleId.courseId.campusId,
      name: lesson.name,
      videoUrl: convertToFullUrl(lesson.videoUrl),
      text: lesson.text || '', // Include text field
      notes: lesson.notes || '', // Ensure notes is always a string
      resolutions: lesson.resolutions || [],
      length: lesson.length || 0,
      createdAt: lesson.createdAt
    });

    const responseData = addProgressToItem(userId, lessonWithResolutions);

    return successResponse(res, 200, 'Lesson retrieved successfully', responseData, 'lesson');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve lesson', error.message);
  }
};

// ADMIN API - Get all lessons with pagination (no membership restrictions)
const getAllLessonsAdmin = async (req, res) => {
  try {
    const { page = 1, perPage = 10, moduleId } = req.query;
    const skip = (page - 1) * perPage;
    
    let matchCondition = {};
    if (moduleId && require('mongoose').Types.ObjectId.isValid(moduleId)) {
      matchCondition.moduleId = new require('mongoose').Types.ObjectId(moduleId);
    }
    
    const pipeline = [
      { $match: matchCondition },
      { $skip: skip },
      { $limit: parseInt(perPage) },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'modules',
          localField: 'moduleId',
          foreignField: '_id',
          as: 'module'
        }
      },
      {
        $lookup: {
          from: 'courses',
          localField: 'module.courseId',
          foreignField: '_id',
          as: 'course'
        }
      },
      {
        $lookup: {
          from: 'campuses',
          localField: 'course.campusId',
          foreignField: '_id',
          as: 'campus'
        }
      },
      {
        $addFields: {
          moduleName: { $arrayElemAt: ['$module.name', 0] },
          courseTitle: { $arrayElemAt: ['$course.title', 0] },
          courseId: { $arrayElemAt: ['$course._id', 0] },
          campusTitle: { $arrayElemAt: ['$campus.title', 0] },
          campusId: { $arrayElemAt: ['$course.campusId', 0] }
        }
      },
      { $project: { module: 0, course: 0, campus: 0 } }
    ];
    
    const lessons = await Lesson.aggregate(pipeline);
    const totalCount = await Lesson.countDocuments(matchCondition);
    const totalPages = Math.ceil(totalCount / perPage);

    return successResponse(res, 200, 'Lessons retrieved successfully.', {
      lessons,
      pagination: {
        page: parseInt(page),
        perPage: parseInt(perPage),
        totalCount,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1
      }
    });
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve lessons', error.message);
  }
};

// ADMIN API - Get single lesson by ID (no membership restrictions)
const getLessonByIdAdmin = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return errorResponse(res, 400, 'Lesson ID is required');
    }

    const lesson = await Lesson.findById(id).populate({
      path: 'moduleId',
      populate: {
        path: 'courseId',
        populate: {
          path: 'campusId',
          select: 'title slug imageUrl'
        }
      }
    });
    
    if (!lesson) {
      return errorResponse(res, 404, 'Lesson not found');
    }

    // Structure response
    const responseData = {
      _id: lesson._id,
      moduleId: lesson.moduleId._id,
      moduleName: lesson.moduleId.name,
      courseId: lesson.moduleId.courseId._id,
      courseTitle: lesson.moduleId.courseId.title,
      campusId: lesson.moduleId.courseId.campusId._id,
      campusTitle: lesson.moduleId.courseId.campusId.title,
      campusSlug: lesson.moduleId.courseId.campusId.slug,
      name: lesson.name,
      videoUrl: convertToFullUrl(lesson.videoUrl),
      text: lesson.text || '',
      notes: lesson.notes || '',
      resolutions: lesson.resolutions || [],
      length: lesson.length || 0,
      createdAt: lesson.createdAt
    };

    return successResponse(res, 200, 'Lesson retrieved successfully', responseData);
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve lesson', error.message);
  }
};

// Get module lessons (Admin) - Simple list without pagination
const getModuleLessonsAdmin = async (req, res) => {
  try {
    const { moduleId } = req.query;

    if (!moduleId) {
      return errorResponse(res, 400, 'Module ID is required');
    }

    if (!mongoose.Types.ObjectId.isValid(moduleId)) {
      return errorResponse(res, 400, 'Invalid module ID format');
    }

    // Verify module exists and get course/campus info
    const module = await Module.findById(moduleId)
      .populate({
        path: 'courseId',
        populate: {
          path: 'campusId',
          select: 'title slug'
        }
      });

    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    // Get all lessons for the module
    const lessons = await Lesson.find({ moduleId })
      .sort({ createdAt: -1 })
      .lean();

    // Add lesson type and stats
    const lessonsWithStats = lessons.map(lesson => {
      const hasVideo = lesson.videoUrl && lesson.videoUrl.trim() !== '';
      const hasText = lesson.text && lesson.text.trim() !== '';
      
      let lessonType = 'empty';
      if (hasVideo && hasText) {
        lessonType = 'mixed';
      } else if (hasVideo) {
        lessonType = 'video';
      } else if (hasText) {
        lessonType = 'text';
      }

      return {
        _id: lesson._id,
        moduleId: lesson.moduleId,
        name: lesson.name,
        videoUrl: convertToFullUrl(lesson.videoUrl),
        hasText: hasText,
        lessonType,
        length: lesson.length || 0,
        resolutions: lesson.resolutions || [],
        notes: lesson.notes || '',
        createdAt: lesson.createdAt
      };
    });

    // Calculate lesson statistics
    const stats = {
      total: lessonsWithStats.length,
      video: lessonsWithStats.filter(l => l.lessonType === 'video').length,
      text: lessonsWithStats.filter(l => l.lessonType === 'text').length,
      mixed: lessonsWithStats.filter(l => l.lessonType === 'mixed').length,
      empty: lessonsWithStats.filter(l => l.lessonType === 'empty').length,
      totalVideoLength: lessonsWithStats.reduce((sum, l) => sum + (l.length || 0), 0)
    };

    const responseData = {
      module: {
        _id: module._id,
        name: module.name,
        courseId: module.courseId ? module.courseId._id : null,
        courseTitle: module.courseId ? module.courseId.title : 'Unknown Course',
        campusId: module.courseId && module.courseId.campusId ? module.courseId.campusId._id : null,
        campusTitle: module.courseId && module.courseId.campusId ? module.courseId.campusId.title : 'Unknown Campus'
      },
      lessonList: lessonsWithStats,
      stats
    };

    return successResponse(res, 200, 'Module lessons retrieved successfully', responseData, 'moduleLessons');
  } catch (error) {
    console.error('Get module lessons error:', error);
    return errorResponse(res, 500, 'Failed to retrieve module lessons', error.message);
  }
};

module.exports = {
  createLesson,
  editLesson,
  deleteLesson,
  listLessonsByModule,
  getLessonById,
  // Admin APIs
  getAllLessonsAdmin,
  getLessonByIdAdmin,
  getModuleLessonsAdmin
}; 