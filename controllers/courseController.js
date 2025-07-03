const Course = require('../models/course');
const Module = require('../models/module');
const Lesson = require('../models/lesson');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');

const createCourse = async (req, res) => {
  try {
    const { campusId, title, imageUrl } = req.body;

    if (!campusId || !title) {
      return errorResponse(res, 400, 'Campus ID and title are required');
    }

    // Verify campus exists (admin operation - no membership check required)
    const Campus = require('../models/campus');
    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    const course = await Course.create({
      campusId,
      title,
      imageUrl
    });

    // Structure response in organized format
    const responseData = {
      _id: course._id,
      campusId: course.campusId,
      title: course.title,
      imageUrl: course.imageUrl,
      createdAt: course.createdAt
    };

    return successResponse(res, 201, 'Course created successfully', responseData, 'course');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to create course', error.message);
  }
};

const editCourse = async (req, res) => {
  try {
    const { courseId } = req.query;
    const { title, imageUrl } = req.body;

    if (!courseId) {
      return errorResponse(res, 400, 'Course ID is required');
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Admin operation - no membership check required
    if (title) course.title = title;
    if (imageUrl !== undefined) course.imageUrl = imageUrl;
    
    await course.save();

    // Structure response in organized format
    const responseData = {
      _id: course._id,
      campusId: course.campusId,
      title: course.title,
      imageUrl: course.imageUrl,
      createdAt: course.createdAt
    };

    return successResponse(res, 200, 'Course updated successfully', responseData, 'course');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update course', error.message);
  }
};

const deleteCourse = async (req, res) => {
  try {
    const { courseId } = req.query;

    if (!courseId) {
      return errorResponse(res, 400, 'Course ID is required');
    }

    const course = await Course.findById(courseId);
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Admin operation - no membership check required
    await Course.findByIdAndDelete(courseId);
    return successResponse(res, 200, 'Course deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete course', error.message);
  }
};

const listCoursesByCampus = async (req, res) => {
  try {
    const { campusId } = req.query;
    const userId = req.userId;

    if (!campusId) {
      return errorResponse(res, 400, 'Campus ID is required');
    }

    // Check if user is a member of the campus
    const { campus, isMember } = await getCampusWithMembershipCheck(campusId, userId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view courses');
    }

    const courses = await Course.find({ campusId }).populate('campusId', 'title slug');
    
    // Structure response in organized format
    const structuredCourses = courses.map(course => ({
      _id: course._id,
      campusId: course.campusId._id,
      title: course.title,
      imageUrl: course.imageUrl,
      createdAt: course.createdAt
    }));

    return successResponse(res, 200, 'Courses retrieved successfully', structuredCourses, 'courses');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve courses', error.message);
  }
};

const getCourseById = async (req, res) => {
  try {
    const { courseId } = req.query;
    const userId = req.userId;

    if (!courseId) {
      return errorResponse(res, 400, 'Course ID is required');
    }

    const course = await Course.findById(courseId).populate('campusId', 'title slug');
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
    }

    // Check if user is a member of the campus
    const { campus, isMember } = await getCampusWithMembershipCheck(course.campusId._id, userId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view this course');
    }

    // Get all modules for this course with their lessons
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

    // Structure the modules with lessons
    const structuredModules = modulesWithLessons.map(module => ({
      _id: module._id,
      courseId: module.courseId,
      campusId: course.campusId._id,
      name: module.name,
      lessons: module.lessons.map(lesson => ({
        _id: lesson._id,
        moduleId: lesson.moduleId,
        courseId: course._id,
        campusId: course.campusId._id,
        name: lesson.name,
        videoUrl: lesson.videoUrl,
        createdAt: lesson.createdAt,
        watchedProgress: (() => {
          const progress = socketManager.videoProgress[userId] && socketManager.videoProgress[userId][lesson._id] ? socketManager.videoProgress[userId][lesson._id] : null;
          return progress ? progress.percentage : 0;
        })(),
        watchSeconds: (() => {
          const progress = socketManager.videoProgress[userId] && socketManager.videoProgress[userId][lesson._id] ? socketManager.videoProgress[userId][lesson._id] : null;
          return progress ? progress.seconds : 0;
        })(),
        totalDuration: (() => {
          const progress = socketManager.videoProgress[userId] && socketManager.videoProgress[userId][lesson._id] ? socketManager.videoProgress[userId][lesson._id] : null;
          return progress ? progress.totalDuration : 0;
        })()
      })),
      createdAt: module.createdAt
    }));

    // Structure response in organized format
    const responseData = {
      _id: course._id,
      campusId: course.campusId._id,
      title: course.title,
      imageUrl: course.imageUrl,
      modules: structuredModules,
      createdAt: course.createdAt
    };

    return successResponse(res, 200, 'Course with complete data retrieved successfully', responseData, 'course');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve course', error.message);
  }
};

module.exports = {
  createCourse,
  editCourse,
  deleteCourse,
  listCoursesByCampus,
  getCourseById
}; 