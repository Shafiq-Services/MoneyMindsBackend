const socketManager = require('./socketManager');

/**
 * Calculate watch progress for a video/lesson using stored length
 * @param {string} userId - User ID
 * @param {string} videoId - Video/Lesson ID
 * @param {number} videoLength - Stored video length in seconds
 * @param {boolean} hasVideo - Whether the content has a video (for lessons)
 * @returns {object} Progress data
 */
const calculateWatchProgress = (userId, videoId, videoLength = 0, hasVideo = true) => {
  // Get stored progress from socket manager
  const progress = socketManager.videoProgress[userId]?.[videoId];
  
  // For text-only lessons (no video)
  if (!hasVideo) {
    if (progress && progress.percentage === 100) {
      return {
        watchedProgress: 100,
        watchSeconds: 0,
        totalDuration: 0
      };
    } else {
      return {
        watchedProgress: 0,
        watchSeconds: 0,
        totalDuration: 0
      };
    }
  }
  
  // For video content
  if (!progress) {
    return {
      watchedProgress: 0,
      watchSeconds: 0,
      totalDuration: videoLength
    };
  }

  // Use stored video length for accurate calculation
  const totalDuration = videoLength || progress.totalDuration || 0;
  const watchSeconds = progress.seconds || 0;
  
  // Calculate percentage using stored length
  const watchedProgress = totalDuration > 0 ? Math.round((watchSeconds / totalDuration) * 100) : 0;

  return {
    watchedProgress: Math.max(0, Math.min(100, watchedProgress)), // Ensure 0-100 range
    watchSeconds: watchSeconds,
    totalDuration: totalDuration
  };
};

/**
 * Calculate watch progress for multiple videos/lessons
 * @param {string} userId - User ID
 * @param {Array} items - Array of video/lesson objects with _id and length
 * @returns {Array} Items with progress data added
 */
const calculateWatchProgressForItems = (userId, items) => {
  return items.map(item => {
    // Check if this is a lesson without video (text-only lesson)
    const hasVideo = item.videoUrl && item.videoUrl.length > 0;
    const progress = calculateWatchProgress(userId, item._id.toString(), item.length || 0, hasVideo);
    
    return {
      ...item,
      watchedProgress: progress.watchedProgress,
      watchSeconds: progress.watchSeconds,
      totalDuration: progress.totalDuration
    };
  });
};

/**
 * Get progress data for a single video/lesson
 * @param {string} userId - User ID
 * @param {object} item - Video/lesson object with _id and length
 * @returns {object} Item with progress data added
 */
const addProgressToItem = (userId, item) => {
  // Check if this is a lesson without video (text-only lesson)
  const hasVideo = item.videoUrl && item.videoUrl.length > 0;
  const progress = calculateWatchProgress(userId, item._id.toString(), item.length || 0, hasVideo);
  
  return {
    ...item,
    watchedProgress: progress.watchedProgress,
    watchSeconds: progress.watchSeconds,
    totalDuration: progress.totalDuration
  };
};

module.exports = {
  calculateWatchProgress,
  calculateWatchProgressForItems,
  addProgressToItem
}; 