const Campus = require('../models/campus');
const Course = require('../models/course');
const Module = require('../models/module');
const Lesson = require('../models/lesson');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { isUserInCampus, getCampusWithMembershipCheck, ensureMoneyMindsCampusExists } = require('../utils/campusHelpers');
const socketManager = require('../utils/socketManager');
const { addVideoResolutions } = require('../utils/videoResolutions');
const { addProgressToItem } = require('../utils/progressHelper');

const createCampus = async (req, res) => {
  try {
    const { slug, title, imageUrl, mainIconUrl, campusIconUrl } = req.body;
    
    if (!slug || !title) {
      return errorResponse(res, 400, 'Slug and title are required');
    }

    const existingCampus = await Campus.findOne({ slug });
    if (existingCampus) {
      return errorResponse(res, 400, 'Campus with this slug already exists');
    }

    const campus = await Campus.create({
      slug,
      title,
      imageUrl: imageUrl || '',
      mainIconUrl: mainIconUrl || '',
      campusIconUrl: campusIconUrl || '',
      members: []
    });

    // Broadcast new campus release to all users
    await socketManager.broadcastNewCampusRelease(campus);

    // Structure response in organized format
    const responseData = {
      _id: campus._id,
      slug: campus.slug,
      title: campus.title,
      imageUrl: campus.imageUrl,
      mainIconUrl: campus.mainIconUrl,
      campusIconUrl: campus.campusIconUrl,
      members: campus.members,
      createdAt: campus.createdAt
    };

    return successResponse(res, 201, 'Campus created successfully', responseData, 'campus');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to create campus', error.message);
  }
};

const editCampus = async (req, res) => {
  try {
    const { campusId } = req.query;
    const { title, imageUrl, mainIconUrl, campusIconUrl } = req.body;

    if (!campusId) {
      return errorResponse(res, 400, 'Campus ID is required');
    }

    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    if (title) campus.title = title;
    if (imageUrl !== undefined) campus.imageUrl = imageUrl;
    if (mainIconUrl !== undefined) campus.mainIconUrl = mainIconUrl;
    if (campusIconUrl !== undefined) campus.campusIconUrl = campusIconUrl;
    
    await campus.save();

    // Structure response in organized format
    const responseData = {
      _id: campus._id,
      slug: campus.slug,
      title: campus.title,
      imageUrl: campus.imageUrl,
      mainIconUrl: campus.mainIconUrl,
      campusIconUrl: campus.campusIconUrl,
      members: campus.members,
      createdAt: campus.createdAt
    };

    return successResponse(res, 200, 'Campus updated successfully', responseData, 'campus');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to update campus', error.message);
  }
};

const deleteCampus = async (req, res) => {
  try {
    const { campusId } = req.query;

    if (!campusId) {
      return errorResponse(res, 400, 'Campus ID is required');
    }

    const campus = await Campus.findByIdAndDelete(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    return successResponse(res, 200, 'Campus deleted successfully');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete campus', error.message);
  }
};

const joinCampus = async (req, res) => {
  try {
    const { campusId } = req.query;
    const userId = req.userId;

    if (!campusId) {
      return errorResponse(res, 400, 'Campus ID is required');
    }

    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    // Check if user is already a member
    if (isUserInCampus(campus, userId)) {
      return errorResponse(res, 400, 'You are already a member of this campus');
    }

    campus.members.push({
      userId,
      joinedAt: new Date()
    });

    await campus.save();
    return successResponse(res, 200, 'Successfully joined campus');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to join campus', error.message);
  }
};

const leaveCampus = async (req, res) => {
  try {
    const { campusId } = req.query;
    const userId = req.userId;

    if (!campusId) {
      return errorResponse(res, 400, 'Campus ID is required');
    }

    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }

    // Check if this is the Money Minds campus
    if (campus.isMoneyMindsCampus) {
      return errorResponse(res, 403, 'You cannot leave the Money Minds campus');
    }

    // Check if user is a member
    if (!isUserInCampus(campus, userId)) {
      return errorResponse(res, 400, 'You are not a member of this campus');
    }

    campus.members = campus.members.filter(
      member => member.userId.toString() !== userId.toString()
    );

    await campus.save();
    return successResponse(res, 200, 'Successfully left campus');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to leave campus', error.message);
  }
};

const listCampuses = async (req, res) => {
  try {
    const userId = req.userId;
    // Only get regular campuses (exclude Money Minds campus from general listing)
    const campuses = await Campus.find({ isMoneyMindsCampus: { $ne: true } }).select('slug title imageUrl mainIconUrl campusIconUrl members createdAt');
    
    const structuredCampuses = campuses.map(campus => {
      const isJoined = campus.members.some(member => 
        member.userId.toString() === userId.toString()
      );
      
      return {
        _id: campus._id,
        slug: campus.slug,
        title: campus.title,
        imageUrl: campus.imageUrl,
        mainIconUrl: campus.mainIconUrl,
        campusIconUrl: campus.campusIconUrl,
        memberCount: campus.members.length,
        joined: isJoined,
        createdAt: campus.createdAt
      };
    });

    return successResponse(res, 200, 'Campuses retrieved successfully', structuredCampuses, 'campuses');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve campuses', error.message);
  }
};

const getUserCampuses = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get existing Money Minds campus (universal virtual campus)
    const { campus: moneyMindsCampus } = await ensureMoneyMindsCampusExists();
    
    if (!moneyMindsCampus) {
      return errorResponse(res, 500, 'Failed to find Money Minds campus');
    }
    
    // Find campuses where the user is a member (excluding Money Minds)
    const userCampuses = await Campus.find({
      'members.userId': userId,
      isMoneyMindsCampus: { $ne: true }
    }).select('slug title imageUrl mainIconUrl campusIconUrl members createdAt');
    
    // Structure response with Money Minds campus at the top
    const structuredUserCampuses = [];
    
    // Add Money Minds campus first (ALWAYS present for ALL users)
    structuredUserCampuses.push({
      _id: moneyMindsCampus._id,
      slug: moneyMindsCampus.slug,
      title: moneyMindsCampus.title,
      imageUrl: moneyMindsCampus.imageUrl,
      mainIconUrl: moneyMindsCampus.mainIconUrl,
      campusIconUrl: moneyMindsCampus.campusIconUrl,
      memberCount: moneyMindsCampus.members.length,
      createdAt: moneyMindsCampus.createdAt
    });
    
    // Add regular campuses
    const regularCampuses = userCampuses.map(campus => ({
      _id: campus._id,
      slug: campus.slug,
      title: campus.title,
      imageUrl: campus.imageUrl,
      mainIconUrl: campus.mainIconUrl,
      campusIconUrl: campus.campusIconUrl,
      memberCount: campus.members.length,
      createdAt: campus.createdAt
    }));
    
    structuredUserCampuses.push(...regularCampuses);

    return successResponse(res, 200, 'User campuses retrieved successfully', structuredUserCampuses, 'userCampuses');
  } catch (error) {
    console.error('❌ [getUserCampuses] Database error:', error.message);
    return errorResponse(res, 500, 'Failed to retrieve user campuses', error.message);
  }
};

const getCampusById = async (req, res) => {
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
      return errorResponse(res, 403, 'You must be a member of this campus to view its details');
    }

    // Get all courses in this campus with their modules and lessons
    const coursesWithData = await Course.aggregate([
      { $match: { campusId: campus._id } },
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
        $sort: { createdAt: 1 }
      }
    ]);

    // Organize the nested structure properly with resolutions
    const structuredCourses = coursesWithData.map(course => {
      const courseModules = course.modules.map(module => {
        const moduleLessons = course.lessons
          .filter(lesson => lesson.moduleId.toString() === module._id.toString())
          .map(lesson => {
            const lessonWithResolutions = addVideoResolutions({
              _id: lesson._id,
              moduleId: lesson.moduleId,
              courseId: course._id,
              campusId: campus._id,
              name: lesson.name,
              videoUrl: lesson.videoUrl,
              notes: lesson.notes || '',
              resolutions: lesson.resolutions || [],
              length: lesson.length || 0,
              createdAt: lesson.createdAt
            });
            
            return addProgressToItem(userId, lessonWithResolutions);
          });

        return {
          _id: module._id,
          courseId: module.courseId,
          campusId: campus._id,
          name: module.name,
          lessons: moduleLessons,
          createdAt: module.createdAt
        };
      });

      // Calculate course progress
      let videosWithProgress = 0;
      let totalVideos = 0;

      // Count videos with progress from socket manager
      courseModules.forEach(module => {
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

      return {
        _id: course._id,
        campusId: course.campusId,
        title: course.title,
        imageUrl: course.imageUrl,
        totalVideos: totalVideos,
        videosWithProgress: videosWithProgress,
        courseProgress: courseProgress,
        modules: courseModules,
        createdAt: course.createdAt
      };
    });

    // Structure the complete campus response
    const responseData = {
      _id: campus._id,
      slug: campus.slug,
      title: campus.title,
      imageUrl: campus.imageUrl,
      mainIconUrl: campus.mainIconUrl,
      campusIconUrl: campus.campusIconUrl,
      memberCount: campus.members.length,
      courses: structuredCourses,
      createdAt: campus.createdAt
    };

    return successResponse(res, 200, 'Campus with complete data retrieved successfully', responseData, 'campus');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve campus', error.message);
  }
};

module.exports = {
  createCampus,
  editCampus,
  deleteCampus,
  joinCampus,
  leaveCampus,
  listCampuses,
  getUserCampuses,
  getCampusById
}; 