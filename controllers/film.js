const Video = require('../models/video');
const WatchProgress = require('../models/watchProgress');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const { addVideoResolutionsToArray } = require('../utils/videoResolutions');

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
    
    // Add watch progress and resolutions to each film
    const filmsWithProgress = films.map(film => {
      const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][film._id] ? socketManager.videoProgress[req.userId][film._id] : null;
      return {
        ...film,
        watchProgress: progress ? progress.percentage : 0,
        watchSeconds: progress ? progress.seconds : 0,
        totalDuration: progress ? progress.totalDuration : 0
      };
    });

    // Add resolutions to all films efficiently
    const filmsWithResolutions = addVideoResolutionsToArray(filmsWithProgress);
    
    const totalCount = await Video.countDocuments({ type: 'film' });
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return res.status(200).json({
      status: true,
      message: 'Random films retrieved successfully.',
      films: filmsWithResolutions,
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

const getPopularFilms = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    
    // Get films where current user has 100% watch progress to exclude them
    const fullyWatchedFilms = await WatchProgress.find({
      userId: userId,
      percentage: 100
    }).distinct('videoId');
    
    // Aggregation pipeline to calculate popularity based on total watch time
    const popularityPipeline = [
      // Match films only
      { $match: { type: 'film' } },
      
      // Exclude films that current user has watched completely
      { $match: { _id: { $nin: fullyWatchedFilms } } },
      
      // Lookup watch progress for each film
      {
        $lookup: {
          from: 'watchprogresses',
          localField: '_id',
          foreignField: 'videoId',
          as: 'watchProgress'
        }
      },
      
      // Calculate total watch time across all users
      {
        $addFields: {
          totalWatchTime: {
            $sum: '$watchProgress.seconds'
          },
          totalWatchers: {
            $size: '$watchProgress'
          }
        }
      },
      
      // Sort by total watch time descending (most popular first)
      { $sort: { totalWatchTime: -1 } },
      
      // Remove the watchProgress array and popularity metrics as we don't need them in response
      { $project: { watchProgress: 0, totalWatchTime: 0, totalWatchers: 0 } },
      
      // Limit to top 20 films
      { $limit: 20 }
    ];
    
    const popularFilms = await Video.aggregate(popularityPipeline);
    
    // Add current user's watch progress and resolutions to each film
    const filmsWithProgress = popularFilms.map(film => {
      const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][film._id] ? socketManager.videoProgress[req.userId][film._id] : null;
      return {
        ...film,
        watchProgress: progress ? progress.percentage : 0,
        watchSeconds: progress ? progress.seconds : 0,
        totalDuration: progress ? progress.totalDuration : 0
      };
    });

    // Add resolutions to all films efficiently
    const filmsWithResolutions = addVideoResolutionsToArray(filmsWithProgress);

    return res.status(200).json({
      status: true,
      message: 'Popular films retrieved successfully.',
      films: filmsWithResolutions
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get popular films.', err.message);
  }
};

module.exports = { getRandomFilms, getPopularFilms }; 