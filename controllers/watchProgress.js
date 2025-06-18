const WatchProgress = require('../models/watch-progress');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const updateWatchProgress = async (req, res) => {
  try {
    const userId = req.userId;
    const { videoId, progress } = req.query;
    
    if (!userId) {
      return errorResponse(res, 400, 'userId (from auth) is required.');
    }
    if (!videoId) {
      return errorResponse(res, 400, 'videoId is required.');
    }
    if (!progress && progress !== '0') {
      return errorResponse(res, 400, 'progress is required.');
    }
    
    // Convert progress to number and validate
    const progressNumber = parseFloat(progress);
    if (isNaN(progressNumber)) {
      return errorResponse(res, 400, 'progress must be a valid number.');
    }
    if (progressNumber < 0 || progressNumber > 100) {
      return errorResponse(res, 400, 'progress must be between 0 and 100.');
    }
    
    const updated = await WatchProgress.findOneAndUpdate(
      { userId, videoId },
      { progress: progressNumber, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    
    return res.status(200).json({ 
      status: true, 
      message: 'Watch progress updated.', 
      watchProgress: updated 
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update watch progress.', err.message);
  }
};

const getWatchProgress = async (req, res) => {
  try {
    const userId = req.userId;
    const { videoId } = req.query;
    
    if (!userId || !videoId) {
      return errorResponse(res, 400, 'userId (from auth) and videoId are required.');
    }
    
    const progress = await WatchProgress.findOne({ userId, videoId });
    
    return res.status(200).json({ 
      status: true, 
      watchProgress: progress ? progress.progress : 0 
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get watch progress.', err.message);
  }
};

module.exports = { updateWatchProgress, getWatchProgress };