const mongoose = require('mongoose');
const Module = require('../models/module');
const Course = require('../models/course');
const Lesson = require('../models/lesson');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');
const { addVideoResolutions } = require('../utils/videoResolutions');
const { addProgressToItem } = require('../utils/progressHelper');

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

    // Structure response in organized format with resolutions
    const structuredModules = modulesWithLessons.map(module => ({
      _id: module._id,
      courseId: course._id,
      campusId: course.campusId,
      name: module.name,
      lessons: module.lessons.map(lesson => {
        const lessonWithResolutions = addVideoResolutions({
          _id: lesson._id,
          moduleId: lesson.moduleId,
          courseId: course._id,
          campusId: course.campusId,
          name: lesson.name,
          videoUrl: lesson.videoUrl,
          notes: lesson.notes || '',
          resolutions: lesson.resolutions || [],
          length: lesson.length || 0,
          createdAt: lesson.createdAt
        });
        
        return addProgressToItem(userId, lessonWithResolutions);
      }),
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

    // Check if courseId exists and is populated
    if (!module.courseId) {
      return errorResponse(res, 404, 'Course not found for this module');
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

    // Structure the lessons with resolutions
    const structuredLessons = lessons.map(lesson => {
      return addVideoResolutions({
        _id: lesson._id,
        moduleId: lesson.moduleId,
        courseId: module.courseId._id,
        campusId: module.courseId.campusId,
        name: lesson.name,
        videoUrl: lesson.videoUrl,
        notes: lesson.notes || '',
        resolutions: lesson.resolutions || [],
        createdAt: lesson.createdAt,
        watchedProgress: socketManager.videoProgress[userId]?.[lesson._id] || 0
      });
    });

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

// ADMIN API - Get all modules with pagination (no membership restrictions)
const getAllModulesAdmin = async (req, res) => {
  try {
    const { page = 1, perPage = 10, courseId } = req.query;
    const skip = (page - 1) * perPage;
    
    let matchCondition = {};
    if (courseId && require('mongoose').Types.ObjectId.isValid(courseId)) {
      matchCondition.courseId = new require('mongoose').Types.ObjectId(courseId);
    }
    
    const pipeline = [
      { $match: matchCondition },
      { $skip: skip },
      { $limit: parseInt(perPage) },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'courses',
          localField: 'courseId',
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
        $lookup: {
          from: 'lessons',
          localField: '_id',
          foreignField: 'moduleId',
          as: 'lessons'
        }
      },
      {
        $addFields: {
          courseTitle: { $arrayElemAt: ['$course.title', 0] },
          campusTitle: { $arrayElemAt: ['$campus.title', 0] },
          campusId: { $arrayElemAt: ['$course.campusId', 0] },
          lessonCount: { $size: '$lessons' }
        }
      },
      { $project: { course: 0, campus: 0, lessons: 0 } }
    ];
    
    const modules = await Module.aggregate(pipeline);
    const totalCount = await Module.countDocuments(matchCondition);
    const totalPages = Math.ceil(totalCount / perPage);

    return successResponse(res, 200, 'Modules retrieved successfully.', {
      modules,
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
    return errorResponse(res, 500, 'Failed to retrieve modules', error.message);
  }
};

// ADMIN API - Get single module by ID (no membership restrictions)
const getModuleByIdAdmin = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return errorResponse(res, 400, 'Module ID is required');
    }

    const module = await Module.findById(id).populate({
      path: 'courseId',
      populate: {
        path: 'campusId',
        select: 'title slug imageUrl'
      }
    });
    
    if (!module) {
      return errorResponse(res, 404, 'Module not found');
    }

    // Get all lessons for this module
    const lessons = await Lesson.find({ moduleId: module._id }).sort({ createdAt: 1 });

    // Structure the lessons
    const structuredLessons = lessons.map(lesson => ({
      _id: lesson._id,
      moduleId: lesson.moduleId,
      name: lesson.name,
      videoUrl: lesson.videoUrl,
      text: lesson.text,
      notes: lesson.notes || '',
      resolutions: lesson.resolutions || [],
      length: lesson.length || 0,
      createdAt: lesson.createdAt
    }));

    // Structure response
    const responseData = {
      _id: module._id,
      courseId: module.courseId._id,
      courseTitle: module.courseId.title,
      campusId: module.courseId.campusId._id,
      campusTitle: module.courseId.campusId.title,
      campusSlug: module.courseId.campusId.slug,
      name: module.name,
      lessons: structuredLessons,
      createdAt: module.createdAt
    };

    return successResponse(res, 200, 'Module retrieved successfully', responseData);
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve module', error.message);
  }
};

// Get course modules (Admin) - Simple list without pagination
const getCourseModulesAdmin = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (!courseId) {
      return errorResponse(res, 400, 'Course ID is required');
    }

    if (!mongoose.Types.ObjectId.isValid(courseId)) {
      return errorResponse(res, 400, 'Invalid course ID format');
    }

    // Verify course exists and get campus info
    const course = await Course.findById(courseId).populate('campusId', 'title slug');
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Get all modules for the course
    const modules = await Module.find({ courseId })
      .sort({ createdAt: -1 })
      .lean();

    // Add lesson count and stats to each module
    const modulesWithStats = await Promise.all(modules.map(async (module) => {
      const lessonCount = await Lesson.countDocuments({ moduleId: module._id });
      const videoLessons = await Lesson.countDocuments({ 
        moduleId: module._id, 
        videoUrl: { $exists: true, $ne: '' } 
      });
      const textLessons = lessonCount - videoLessons;
      
      return {
        _id: module._id,
        courseId: module.courseId,
        name: module.name,
        lessonCount,
        videoLessons,
        textLessons,
        createdAt: module.createdAt
      };
    }));

    const responseData = {
      course: {
        _id: course._id,
        title: course.title,
        campusId: course.campusId ? course.campusId._id : course.campusId,
        campusTitle: course.campusId ? course.campusId.title : 'Unknown Campus'
      },
      moduleList: modulesWithStats
    };

    return successResponse(res, 200, 'Course modules retrieved successfully', responseData, 'courseModules');
  } catch (error) {
    console.error('Get course modules error:', error);
    return errorResponse(res, 500, 'Failed to retrieve course modules', error.message);
  }
};

module.exports = {
  createModule,
  editModule,
  deleteModule,
  listModulesByCourse,
  getModuleById,
  // Admin APIs
  getAllModulesAdmin,
  getModuleByIdAdmin,
  getCourseModulesAdmin
}; 