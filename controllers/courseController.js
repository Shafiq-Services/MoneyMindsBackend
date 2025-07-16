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
    const userId = req.userId;
    console.log('🔍 [Continue Learning] Starting API call for user:', userId);

    // Get all campuses where user is a member
    const userCampuses = await Campus.find({ 'members.userId': userId });
    const campusIds = userCampuses.map(campus => campus._id);
    console.log('🏫 [Continue Learning] User campuses found:', userCampuses.length);
    console.log('🏫 [Continue Learning] Campus IDs:', campusIds.map(id => id.toString()));

    if (campusIds.length === 0) {
      console.log('❌ [Continue Learning] No campuses found for user');
      return successResponse(res, 200, 'No campuses found for user', {
        continueLearning: [],
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          totalCount: 0,
          totalPages: 0
        }
      }, 'continueLearning');
    }

    // Get all courses from user's campuses with modules and lessons
    console.log('📚 [Continue Learning] Fetching courses from user campuses...');
    const coursesWithProgress = await Course.aggregate([
      { $match: { campusId: { $in: campusIds } } },
      {
        $lookup: {
          from: 'modules',
          localField: '_id',
          foreignField: 'courseId',
          as: 'modules'
        }
      },
      {
        $lookup: {
          from: 'lessons',
          localField: 'modules._id',
          foreignField: 'moduleId',
          as: 'lessons'
        }
      },
      {
        $addFields: {
          totalVideos: { $size: '$lessons' },
          videosWithProgress: {
            $size: {
              $filter: {
                input: '$lessons',
                as: 'lesson',
                cond: {
                  $and: [
                    { $ne: ['$$lesson.videoUrl', null] },
                    { $ne: ['$$lesson.videoUrl', ''] }
                  ]
                }
              }
            }
          }
        }
      },
      {
        $addFields: {
          courseProgress: {
            $cond: {
              if: { $gt: ['$totalVideos', 0] },
              then: {
                $multiply: [
                  {
                    $divide: [
                      {
                        $size: {
                          $filter: {
                            input: '$lessons',
                            as: 'lesson',
                            cond: {
                              $and: [
                                { $ne: ['$$lesson.videoUrl', null] },
                                { $ne: ['$$lesson.videoUrl', ''] },
                                {
                                  $gt: [
                                    {
                                      $ifNull: [
                                        { $arrayElemAt: [{ $objectToArray: { $ifNull: ['$videoProgress', {}] } }, 0] },
                                        0
                                      ]
                                    },
                                    0
                                  ]
                                }
                              ]
                            }
                          }
                        }
                      },
                      '$totalVideos'
                    ]
                  },
                  100
                ]
              },
              else: 0
            }
          }
        }
      },
      {
        $match: {
          $or: [
            { totalVideos: { $gt: 0 } },
            { courseProgress: { $gt: 0 } }
          ]
        }
      },
      {
        $sort: { courseProgress: -1, createdAt: -1 }
      }
    ]);

    // Process each course to calculate actual progress from socket manager
    console.log('📊 [Continue Learning] Processing courses, total found:', coursesWithProgress.length);
    console.log('🎯 [Continue Learning] User progress in socket manager:', socketManager.videoProgress[userId] ? Object.keys(socketManager.videoProgress[userId]).length : 0, 'videos');
    
    // If no progress in memory, try loading from database
    if (!socketManager.videoProgress[userId] || Object.keys(socketManager.videoProgress[userId]).length === 0) {
      console.log('⚠️ [Continue Learning] No progress in memory, loading from database...');
      await socketManager.loadUserWatchProgress(userId);
      console.log('🔄 [Continue Learning] After loading from DB, user has progress for:', socketManager.videoProgress[userId] ? Object.keys(socketManager.videoProgress[userId]).length : 0, 'videos');
    }
    
    const processedCourses = coursesWithProgress.map(course => {
      let videosWithProgress = 0;
      let totalVideos = 0;
      let latestProgressTime = 0;

      console.log(`📖 [Continue Learning] Processing course: "${course.title}" (${course._id})`);
      console.log(`📖 [Continue Learning] Course has ${course.lessons.length} lessons`);

      // Count videos with progress from socket manager
      course.lessons.forEach(lesson => {
        if (lesson.videoUrl && lesson.videoUrl.trim() !== '') {
          totalVideos++;
          const progress = socketManager.videoProgress[userId] && 
                          socketManager.videoProgress[userId][lesson._id.toString()];
          if (progress && progress.percentage > 0) {
            videosWithProgress++;
            console.log(`📹 [Continue Learning] Found progress for lesson ${lesson._id}: ${progress.percentage}% (${progress.seconds}s)`);
            // Track the most recent progress time using actual timestamp
            latestProgressTime = Math.max(latestProgressTime, progress.lastUpdated || 0);
          } else {
            console.log(`📹 [Continue Learning] No progress for lesson ${lesson._id}`);
          }
        }
      });

      console.log(`📊 [Continue Learning] Course "${course.title}": ${videosWithProgress}/${totalVideos} videos with progress`);

      // Calculate course progress percentage: (videos with progress / total videos) * 100
      const courseProgress = totalVideos > 0 ? Math.round((videosWithProgress / totalVideos) * 100) : 0;

      // Get campus info
      const campus = userCampuses.find(c => c._id.toString() === course.campusId.toString());

      return {
        _id: course._id,
        campusId: course.campusId,
        campusTitle: campus ? campus.title : '',
        campusSlug: campus ? campus.slug : '',
        campusImageUrl: campus ? campus.imageUrl : '',
        title: course.title,
        imageUrl: course.imageUrl,
        totalVideos: totalVideos,
        videosWithProgress: videosWithProgress,
        courseProgress: courseProgress,
        createdAt: course.createdAt
      };
    });

    // Filter courses that have actual progress and sort by recent progress
    console.log('🔍 [Continue Learning] Filtering courses with progress...');
    const coursesWithActualProgress = processedCourses
      .filter(course => {
        const hasProgress = course.courseProgress > 0;
        console.log(`📊 [Continue Learning] Course "${course.title}": ${hasProgress ? 'HAS' : 'NO'} progress (${course.courseProgress}%)`);
        return hasProgress;
      })
      .sort((a, b) => {
        // First sort by latest progress time (most recent first)
        if (b.latestProgressTime !== a.latestProgressTime) {
          return b.latestProgressTime - a.latestProgressTime;
        }
        // Then by course progress percentage (highest first)
        if (b.courseProgress !== a.courseProgress) {
          return b.courseProgress - a.courseProgress;
        }
        // Finally by creation date (newest first)
        return new Date(b.createdAt) - new Date(a.createdAt);
      });

    console.log('✅ [Continue Learning] Final result:', coursesWithActualProgress.length, 'courses with progress');
    console.log('📋 [Continue Learning] Returning courses:', coursesWithActualProgress.map(c => `"${c.title}" (${c.courseProgress}%)`));

    return successResponse(res, 200, 'Continue learning courses retrieved successfully', {
      continueLearning: coursesWithActualProgress
    }, 'continueLearning');

  } catch (error) {
    console.error('❌ [Continue Learning] Error:', error.message);
    console.error('❌ [Continue Learning] Stack:', error.stack);
    return errorResponse(res, 500, 'Failed to get continue learning courses', error.message);
  }
};

module.exports = {
  createCourse,
  editCourse,
  deleteCourse,
  listCoursesByCampus,
  getCourseById,
  getContinueLearning
}; 