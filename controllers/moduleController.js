const Module = require('../models/module');
const Course = require('../models/course');
const Lesson = require('../models/lesson');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');

const createModule = async (req, res) => {
  try {
    const { courseId, name } = req.body;

    if (!courseId || !name) {
      return errorResponse(res, 400, 'Course ID and name are required');
    }

    // Verify course exists (admin operation - no membership check required)
    const course = await Course.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    const module = await Module.create({
      courseId,
      name
    });

    // Structure response in organized format
    const responseData = {
      _id: module._id,
      courseId: module.courseId,
      campusId: course.campusId,
      name: module.name,
      createdAt: module.createdAt
    };

    return successResponse(res, 201, 'Module created successfully', responseData, 'module');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to create module', error.message);
  }
};

const editModule = async (req, res) => {
  try {
    const { moduleId } = req.query;
    const { name } = req.body;

    if (!moduleId) {
      return errorResponse(res, 400, 'Module ID is required');
    }

    const module = await Module.findById(moduleId).populate('courseId');
    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    // Admin operation - no membership check required
    if (name) module.name = name;
    
    await module.save();

    // Structure response in organized format
    const responseData = {
      _id: module._id,
      courseId: module.courseId._id,
      campusId: module.courseId.campusId,
      name: module.name,
      createdAt: module.createdAt
    };

    return successResponse(res, 200, 'Module updated successfully', responseData, 'module');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update module', error.message);
  }
};

const deleteModule = async (req, res) => {
  try {
    const { moduleId } = req.query;

    if (!moduleId) {
      return errorResponse(res, 400, 'Module ID is required');
    }

    const module = await Module.findById(moduleId);
    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    // Admin operation - no membership check required
    await Module.findByIdAndDelete(moduleId);
    return successResponse(res, 200, 'Module deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete module', error.message);
  }
};

const listModulesByCourse = async (req, res) => {
  try {
    const { courseId } = req.query;
    const userId = req.userId;

    if (!courseId) {
      return errorResponse(res, 400, 'Course ID is required');
    }

    // Find the course and check campus membership
    const course = await Course.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Check if user is a member of the campus
    const { campus, isMember } = await getCampusWithMembershipCheck(course.campusId, userId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view modules');
    }

    // Get modules with embedded lessons using aggregation
    const modulesWithLessons = await Module.aggregate([
      { $match: { courseId: course._id } },
      {
        $lookup: {
          from: 'lessons',
          localField: '_id',
          foreignField: 'moduleId',
          as: 'lessons'
        }
      },
      {
        $sort: { createdAt: 1 }
      }
    ]);

    // Structure response in organized format
    const structuredModules = modulesWithLessons.map(module => ({
      _id: module._id,
      courseId: course._id,
      campusId: course.campusId,
      name: module.name,
      lessons: module.lessons.map(lesson => ({
        _id: lesson._id,
        moduleId: lesson.moduleId,
        courseId: course._id,
        campusId: course.campusId,
        name: lesson.name,
        videoUrl: lesson.videoUrl,
        createdAt: lesson.createdAt,
        watchedProgress: socketManager.videoProgress[userId][lesson._id] || 0
      })),
      createdAt: module.createdAt
    }));

    return successResponse(res, 200, 'Modules with lessons retrieved successfully', structuredModules, 'modules');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve modules', error.message);
  }
};

const getModuleById = async (req, res) => {
  try {
    const { moduleId } = req.query;
    const userId = req.userId;

    if (!moduleId) {
      return errorResponse(res, 400, 'Module ID is required');
    }

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
      return errorResponse(res, 403, 'You must be a member of this campus to view this module');
    }

    // Get all lessons for this module
    const lessons = await Lesson.find({ moduleId: module._id }).sort({ createdAt: 1 });

    // Structure the lessons
    const structuredLessons = lessons.map(lesson => ({
      _id: lesson._id,
      moduleId: lesson.moduleId,
      courseId: module.courseId._id,
      campusId: module.courseId.campusId,
      name: lesson.name,
      videoUrl: lesson.videoUrl,
      createdAt: lesson.createdAt,
      watchedProgress: socketManager.videoProgress[userId][lesson._id] || 0
    }));

    // Structure response in organized format
    const responseData = {
      _id: module._id,
      courseId: module.courseId._id,
      campusId: module.courseId.campusId,
      name: module.name,
      lessons: structuredLessons,
      createdAt: module.createdAt
    };

    return successResponse(res, 200, 'Module with complete data retrieved successfully', responseData, 'module');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve module', error.message);
  }
};

module.exports = {
  createModule,
  editModule,
  deleteModule,
  listModulesByCourse,
  getModuleById
}; 