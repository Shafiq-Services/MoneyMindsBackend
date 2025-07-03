const Video = require('../models/video');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');

const getRandomFilms = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    const userId = new mongoose.Types.ObjectId(req.userId);
    
    // Use aggregation for efficient random sampling and pagination
    const pipeline = [
      { $match: { type: 'film' } },
      { $sample: { size: pagination.perPage * 10 } }, // Sample more for better randomness
      { $skip: pagination.skip },
      { $limit: pagination.perPage }
    ];
    
    const films = await Video.aggregate(pipeline);
    
    // Add watch progress to each film
    const filmsWithProgress = films.map(film => {
      const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][film._id] ? socketManager.videoProgress[req.userId][film._id] : null;
      return {
        ...film,
        watchProgress: progress ? progress.percentage : 0,
        watchSeconds: progress ? progress.seconds : 0,
        totalDuration: progress ? progress.totalDuration : 0
      };
    });
    
    const totalCount = await Video.countDocuments({ type: 'film' });
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return res.status(200).json({
      status: true,
      message: 'Random films retrieved successfully.',
      films: filmsWithProgress,
      pagination: {
        page: pagination.page,
        perPage: pagination.perPage,
        totalCount,
        totalPages,
        hasNext: pagination.page < totalPages,
        hasPrev: pagination.page > 1
      }
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get random films.', err.message);
  }
};

module.exports = { getRandomFilms }; 