const mongoose = require('mongoose');
const Course = require('../models/course');
const Module = require('../models/module');
const Lesson = require('../models/lesson');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');
const Campus = require('../models/campus');
const { addVideoResolutions } = require('../utils/videoResolutions');
const { addProgressToItem } = require('../utils/progressHelper');

const createCourse = async (req, res) => {
  try {
    const { campusId, title, imageUrl } = req.body;

    if (!campusId || !title) {
      return errorResponse(res, 400, 'Campus ID and title are required');
    }

    // Verify campus exists (admin operation - no membership check required)
    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    const course = await Course.create({
      campusId,
      title,
      imageUrl
    });

    // Broadcast new course release to campus members
    await socketManager.broadcastNewCourseRelease(course, campus.title);

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

    // Get courses with lessons for progress calculation
    const coursesWithProgress = await Course.aggregate([
      { $match: { campusId: new mongoose.Types.ObjectId(campusId) } },
      {
        $lookup: {
          from: 'lessons',
          localField: '_id',
          foreignField: 'courseId',
          as: 'lessons'
        }
      }
    ]);

    // Process each course to calculate progress
    const structuredCourses = coursesWithProgress.map(course => {
      let videosWithProgress = 0;
      let totalVideos = 0;

      // Count videos with progress from socket manager
      course.lessons.forEach(lesson => {
        if (lesson.videoUrl && lesson.videoUrl.trim() !== '') {
          totalVideos++;
          const progress = socketManager.videoProgress[userId] && 
                          socketManager.videoProgress[userId][lesson._id.toString()];
          if (progress && progress.percentage > 0) {
            videosWithProgress++;
          }
        }
      });

      // Calculate course progress percentage
      const courseProgress = totalVideos > 0 ? Math.round((videosWithProgress / totalVideos) * 100) : 0;

      return {
        _id: course._id,
        campusId: course.campusId,
        campusTitle: campus.title,
        campusSlug: campus.slug,
        title: course.title,
        imageUrl: course.imageUrl,
        totalVideos: totalVideos,
        videosWithProgress: videosWithProgress,
        courseProgress: courseProgress,
        createdAt: course.createdAt
      };
    });

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

    // Structure the modules with lessons and add resolutions
    const structuredModules = modulesWithLessons.map(module => ({
      _id: module._id,
      courseId: module.courseId,
      campusId: course.campusId._id,
      name: module.name,
      lessons: module.lessons.map(lesson => {
        const lessonWithResolutions = addVideoResolutions({
          _id: lesson._id,
          moduleId: lesson.moduleId,
          courseId: course._id,
          campusId: course.campusId._id,
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

    // Calculate course progress
    let videosWithProgress = 0;
    let totalVideos = 0;

    // Count videos with progress from socket manager
    structuredModules.forEach(module => {
      module.lessons.forEach(lesson => {
        if (lesson.videoUrl && lesson.videoUrl.trim() !== '') {
          totalVideos++;
          if (lesson.watchedProgress > 0) {
            videosWithProgress++;
          }
        }
      });
    });

    // Calculate course progress percentage
    const courseProgress = totalVideos > 0 ? Math.round((videosWithProgress / totalVideos) * 100) : 0;

    // Structure response in organized format
    const responseData = {
      _id: course._id,
      campusId: course.campusId._id,
      campusTitle: course.campusId.title,
      campusSlug: course.campusId.slug,
      title: course.title,
      imageUrl: course.imageUrl,
      totalVideos: totalVideos,
      videosWithProgress: videosWithProgress,
      courseProgress: courseProgress,
      modules: structuredModules,
      createdAt: course.createdAt
    };

    return successResponse(res, 200, 'Course with complete data retrieved successfully', responseData, 'course');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve course', error.message);
  }
};

const getContinueLearning = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const userId = req.userId;
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    console.log('🔍 [Continue Learning] Starting API call for user:', userId);

    // Optimized campus query - get both user campuses and Money Minds campus in one query
    const userCampuses = await Campus.find({ 
      $or: [
        { 'members.userId': userObjectId },
        { isMoneyMindsCampus: true }
      ]
    }).select('_id title slug imageUrl isMoneyMindsCampus').lean();
    
    if (userCampuses.length === 0) {
      console.log('❌ [Continue Learning] No campuses found for user');
      return successResponse(res, 200, 'No campuses found for user', {
        continueLearning: []
      }, 'continueLearning');
    }
    
    console.log('🏫 [Continue Learning] User campuses found:', userCampuses.length);
    const campusIds = userCampuses.map(campus => campus._id);

    // Load user progress from database if not in memory
    if (!socketManager.videoProgress[userId] || Object.keys(socketManager.videoProgress[userId]).length === 0) {
      console.log('⚠️ [Continue Learning] Loading progress from database...');
      await socketManager.loadUserWatchProgress(userId);
    }
    
    const userProgress = socketManager.videoProgress[userId] || {};
    const progressVideoIds = Object.keys(userProgress);
    
    console.log('🎯 [Continue Learning] User has progress for:', progressVideoIds.length, 'videos');
    
    // Early return if no progress
    if (progressVideoIds.length === 0) {
      console.log('📊 [Continue Learning] No progress found, returning empty result');
      return successResponse(res, 200, 'Continue learning courses retrieved successfully', {
        continueLearning: []
      }, 'continueLearning');
    }

    // Find lessons with progress - more efficient than complex aggregation
    const lessonsWithProgress = await Lesson.find({
      _id: { $in: progressVideoIds.map(id => new mongoose.Types.ObjectId(id)) },
      videoUrl: { $ne: '' }
    }).select('_id moduleId name videoUrl length').lean();
    
    if (lessonsWithProgress.length === 0) {
      console.log('📊 [Continue Learning] No lessons with progress found');
      return successResponse(res, 200, 'Continue learning courses retrieved successfully', {
        continueLearning: []
      }, 'continueLearning');
    }
    
    const moduleIds = [...new Set(lessonsWithProgress.map(lesson => lesson.moduleId))];
    
    // Get courses through modules
    const modules = await Module.find({
      _id: { $in: moduleIds }
    }).select('_id courseId name').lean();
    
    const courseIds = [...new Set(modules.map(module => module.courseId))];
    
    // Get courses with basic info
    const courses = await Course.find({
      _id: { $in: courseIds },
      campusId: { $in: campusIds }
    }).select('_id title description imageUrl campusId createdAt').lean();
    
    // Process courses with progress calculation
    const coursesWithProgress = [];
    
    for (const course of courses) {
      // Get all lessons for this course
      const courseModules = modules.filter(m => m.courseId.toString() === course._id.toString());
      const courseModuleIds = courseModules.map(m => m._id);
      
      const allCourseLessons = await Lesson.find({
        moduleId: { $in: courseModuleIds },
        videoUrl: { $ne: '' }
      }).select('_id name videoUrl length').lean();
      
      const totalVideos = allCourseLessons.length;
      let videosWithProgress = 0;
      let latestProgressTime = 0;
      
      // Calculate progress for this course
      for (const lesson of allCourseLessons) {
        const progress = userProgress[lesson._id.toString()];
        if (progress && progress.percentage > 0) {
          videosWithProgress++;
          latestProgressTime = Math.max(latestProgressTime, progress.lastUpdated || 0);
        }
      }
      
      // Only include courses with actual progress
      if (videosWithProgress > 0) {
        const courseProgress = totalVideos > 0 ? Math.round((videosWithProgress / totalVideos) * 100) : 0;
        const campus = userCampuses.find(c => c._id.toString() === course.campusId.toString());
        
        coursesWithProgress.push({
          _id: course._id,
          title: course.title,
          description: course.description,
          imageUrl: course.imageUrl,
          campusId: course.campusId,
          campusTitle: campus?.title || '',
          campusSlug: campus?.slug || '',
          campusImageUrl: campus?.imageUrl || '',
          totalVideos,
          videosWithProgress,
          courseProgress,
          latestProgressTime,
          createdAt: course.createdAt
        });
      }
    }
    
    // Sort by latest progress time, then by creation date
    coursesWithProgress.sort((a, b) => {
      if (b.latestProgressTime !== a.latestProgressTime) {
        return b.latestProgressTime - a.latestProgressTime;
      }
      return new Date(b.createdAt) - new Date(a.createdAt);
    });
    
    
    return successResponse(res, 200, 'Continue learning courses retrieved successfully', {
      continueLearning: coursesWithProgress
    }, 'continueLearning');

  } catch (error) {
    console.error('❌ [Continue Learning] Error:', error.message);
    console.error('❌ [Continue Learning] Stack:', error.stack);
    return errorResponse(res, 500, 'Failed to get continue learning courses', error.message);
  }
};

// ADMIN API - Get all courses with pagination (no membership restrictions)
const getAllCoursesAdmin = async (req, res) => {
  try {
    const { page = 1, perPage = 10, campusId } = req.query;
    const skip = (page - 1) * perPage;
    
    let matchCondition = {};
    if (campusId && mongoose.Types.ObjectId.isValid(campusId)) {
      matchCondition.campusId = new mongoose.Types.ObjectId(campusId);
    }
    
    const pipeline = [
      { $match: matchCondition },
      { $skip: skip },
      { $limit: parseInt(perPage) },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'campuses',
          localField: 'campusId',
          foreignField: '_id',
          as: 'campus'
        }
      },
      {
        $lookup: {
          from: 'modules',
          localField: '_id',
          foreignField: 'courseId',
          as: 'modules'
        }
      },
      {
        $addFields: {
          campusTitle: { $arrayElemAt: ['$campus.title', 0] },
          campusSlug: { $arrayElemAt: ['$campus.slug', 0] },
          moduleCount: { $size: '$modules' }
        }
      },
      { $project: { campus: 0, modules: 0 } }
    ];
    
    const courses = await Course.aggregate(pipeline);
    const totalCount = await Course.countDocuments(matchCondition);
    const totalPages = Math.ceil(totalCount / perPage);

    return successResponse(res, 200, 'Courses retrieved successfully.', {
      courses,
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
    return errorResponse(res, 500, 'Failed to retrieve courses', error.message);
  }
};

// ADMIN API - Get single course by ID (no membership restrictions)
const getCourseByIdAdmin = async (req, res) => {
  try {
    const { id } = req.query;

    if (!id) {
      return errorResponse(res, 400, 'Course ID is required');
    }

    const course = await Course.findById(id).populate('campusId', 'title slug imageUrl');
    if (!course) {
      return errorResponse(res, 404, 'Course not found');
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
      name: module.name,
      lessons: module.lessons.map(lesson => ({
        _id: lesson._id,
        moduleId: lesson.moduleId,
        name: lesson.name,
        videoUrl: lesson.videoUrl,
        text: lesson.text,
        notes: lesson.notes || '',
        resolutions: lesson.resolutions || [],
        length: lesson.length || 0,
        createdAt: lesson.createdAt
      })),
      createdAt: module.createdAt
    }));

    // Structure response
    const responseData = {
      _id: course._id,
      campusId: course.campusId._id,
      campusTitle: course.campusId.title,
      campusSlug: course.campusId.slug,
      campusImageUrl: course.campusId.imageUrl,
      title: course.title,
      imageUrl: course.imageUrl,
      modules: structuredModules,
      createdAt: course.createdAt
    };

    return successResponse(res, 200, 'Course retrieved successfully', responseData);
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve course', error.message);
  }
};

// Get campus courses (Admin) - Simple list without pagination
const getCampusCoursesAdmin = async (req, res) => {
  try {
    const { campusId } = req.query;

    if (!campusId) {
      return errorResponse(res, 400, 'Campus ID is required');
    }

    if (!mongoose.Types.ObjectId.isValid(campusId)) {
      return errorResponse(res, 400, 'Invalid campus ID format');
    }

    // Verify campus exists
    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    // Get all courses for the campus
    const courses = await Course.find({ campusId })
      .sort({ createdAt: -1 })
      .lean();

    // Add module count to each course
    const coursesWithStats = await Promise.all(courses.map(async (course) => {
      const moduleCount = await Module.countDocuments({ courseId: course._id });
      
      return {
        _id: course._id,
        campusId: course.campusId,
        title: course.title,
        imageUrl: course.imageUrl,
        moduleCount,
        createdAt: course.createdAt
      };
    }));

    const responseData = {
      campus: {
        _id: campus._id,
        title: campus.title,
        slug: campus.slug
      },
      courseList: coursesWithStats
    };

    return successResponse(res, 200, 'Campus courses retrieved successfully', responseData, 'campusCourses');
  } catch (error) {
    console.error('Get campus courses error:', error);
    return errorResponse(res, 500, 'Failed to retrieve campus courses', error.message);
  }
};

module.exports = {
  createCourse,
  editCourse,
  deleteCourse,
  listCoursesByCampus,
  getCourseById,
  getContinueLearning,
  // Admin APIs
  getAllCoursesAdmin,
  getCourseByIdAdmin,
  getCampusCoursesAdmin
}; 