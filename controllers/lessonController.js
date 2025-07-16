const Lesson = require('../models/lesson');
const Module = require('../models/module');
const Course = require('../models/course');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');
const { addVideoResolutions, fetchResolutionsFromVideoUrl } = require('../utils/videoResolutions');
const { calculateVideoDuration } = require('../utils/videoDuration');
const { addProgressToItem } = require('../utils/progressHelper');

const createLesson = async (req, res) => {
  try {
    const { moduleId, name, videoUrl, notes } = req.body;

    if (!moduleId || !name || !videoUrl) {
      return errorResponse(res, 400, 'Module ID, name, and video URL are required');
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

    // Fetch resolutions from video URL and store them
    console.log('🎬 Fetching resolutions for lesson:', name);
    const resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
    console.log('📊 Resolutions found:', resolutions);

    // Calculate video duration automatically
    console.log('📏 Calculating video duration for lesson:', name);
    const videoDuration = await calculateVideoDuration(videoUrl);
    console.log('⏱️ Video duration calculated:', videoDuration, 'seconds');

    const lesson = await Lesson.create({
      moduleId,
      name,
      videoUrl,
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
      videoUrl: lesson.videoUrl,
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
    const { name, videoUrl, notes } = req.body;

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
    if (videoUrl) {
      lesson.videoUrl = videoUrl;
      // If video URL is changed, fetch new resolutions and calculate duration
      console.log('🎬 Video URL changed, fetching new resolutions for lesson:', lesson.name);
      const resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
      console.log('📊 New resolutions found:', resolutions);
      lesson.resolutions = resolutions;
      
      // Calculate new video duration
      console.log('📏 Recalculating video duration for lesson:', lesson.name);
      const videoDuration = await calculateVideoDuration(videoUrl);
      console.log('⏱️ New video duration calculated:', videoDuration, 'seconds');
      lesson.length = videoDuration;
    }
    
    await lesson.save();

    // Structure response in organized format with resolutions and progress
    const lessonWithResolutions = addVideoResolutions({
      _id: lesson._id,
      moduleId: lesson.moduleId._id,
      courseId: lesson.moduleId.courseId._id,
      campusId: lesson.moduleId.courseId.campusId,
      name: lesson.name,
      videoUrl: lesson.videoUrl,
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
        videoUrl: lesson.videoUrl,
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
      videoUrl: lesson.videoUrl,
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

module.exports = {
  createLesson,
  editLesson,
  deleteLesson,
  listLessonsByModule,
  getLessonById
}; 