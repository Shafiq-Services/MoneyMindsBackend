const Lesson = require('../models/lesson');
const Module = require('../models/module');
const Course = require('../models/course');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');
const { addVideoResolutions, fetchResolutionsFromVideoUrl } = require('../utils/videoResolutions');

const createLesson = async (req, res) => {
  try {
    const { moduleId, name, videoUrl } = req.body;

    if (!moduleId || !name || !videoUrl) {
      return errorResponse(res, 400, 'Module ID, name, and video URL are required');
    }

    // Verify module exists and get course info (admin operation - no membership check required)
    const module = await Module.findById(moduleId).populate('courseId');
    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    // Fetch resolutions from video URL and store them
    console.log('🎬 Fetching resolutions for lesson:', name);
    const resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
    console.log('📊 Resolutions found:', resolutions);

    const lesson = await Lesson.create({
      moduleId,
      name,
      videoUrl,
      resolutions: resolutions
    });

    // Structure response in organized format with resolutions
    const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][lesson._id] ? socketManager.videoProgress[req.userId][lesson._id] : null;
    const responseData = addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId,
      courseId: module.courseId._id,
      campusId: module.courseId.campusId,
      name: lesson.name,
      videoUrl: lesson.videoUrl,
      resolutions: lesson.resolutions || [],
      watchedProgress: progress ? progress.percentage : 0,
      watchSeconds: progress ? progress.seconds : 0,
      totalDuration: progress ? progress.totalDuration : 0,
      createdAt: lesson.createdAt
    });

    return successResponse(res, 201, 'Lesson created successfully', responseData, 'lesson');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to create lesson', error.message);
  }
};

const editLesson = async (req, res) => {
  try {
    const { lessonId } = req.query;
    const { name, videoUrl } = req.body;

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
    if (videoUrl) {
      lesson.videoUrl = videoUrl;
      // If video URL is changed, fetch new resolutions
      console.log('🎬 Video URL changed, fetching new resolutions for lesson:', lesson.name);
      const resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
      console.log('📊 New resolutions found:', resolutions);
      lesson.resolutions = resolutions;
    }
    
    await lesson.save();

    // Structure response in organized format with resolutions
    const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][lesson._id] ? socketManager.videoProgress[req.userId][lesson._id] : null;
    const responseData = addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId._id,
      courseId: lesson.moduleId.courseId._id,
      campusId: lesson.moduleId.courseId.campusId,
      name: lesson.name,
      videoUrl: lesson.videoUrl,
      resolutions: lesson.resolutions || [],
      watchedProgress: progress ? progress.percentage : 0,
      watchSeconds: progress ? progress.seconds : 0,
      totalDuration: progress ? progress.totalDuration : 0,
      createdAt: lesson.createdAt
    });

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
    
    // Structure response in organized format with resolutions
    const structuredLessons = lessons.map(lesson => {
      const progress = socketManager.videoProgress[userId] && socketManager.videoProgress[userId][lesson._id] ? socketManager.videoProgress[userId][lesson._id] : null;
      return addVideoResolutions({
        _id: lesson._id,
        moduleId: lesson.moduleId._id,
        courseId: module.courseId._id,
        campusId: module.courseId.campusId,
        name: lesson.name,
        videoUrl: lesson.videoUrl,
        resolutions: lesson.resolutions || [],
        watchedProgress: progress ? progress.percentage : 0,
        watchSeconds: progress ? progress.seconds : 0,
        totalDuration: progress ? progress.totalDuration : 0,
        createdAt: lesson.createdAt
      });
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

    // Structure response in organized format with resolutions
    const progress = socketManager.videoProgress[userId] && socketManager.videoProgress[userId][lesson._id] ? socketManager.videoProgress[userId][lesson._id] : null;
    const responseData = await addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId._id,
      courseId: lesson.moduleId.courseId._id,
      campusId: lesson.moduleId.courseId.campusId,
      name: lesson.name,
      videoUrl: lesson.videoUrl,
      watchedProgress: progress ? progress.percentage : 0,
      watchSeconds: progress ? progress.seconds : 0,
      totalDuration: progress ? progress.totalDuration : 0,
      createdAt: lesson.createdAt
    });

    return successResponse(res, 200, 'Lesson retrieved successfully', responseData, 'lesson');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve lesson', error.message);
  }
};

module.exports = {
  createLesson,
  editLesson,
  deleteLesson,
  listLessonsByModule,
  getLessonById
}; 