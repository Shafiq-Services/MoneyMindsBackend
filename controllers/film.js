const Video = require('../models/video');
const WatchProgress = require('../models/watchProgress');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const { addVideoResolutionsToArray } = require('../utils/videoResolutions');
const { addProgressToItem } = require('../utils/progressHelper');
const { convertToFullUrl } = require('../utils/urlHelper');

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
      return addProgressToItem(req.userId, film);
    });

    // Add resolutions to all films efficiently
    const filmsWithResolutions = addVideoResolutionsToArray(filmsWithProgress);
    
    // Convert URLs to full Azure CDN format
    const filmsWithConvertedUrls = filmsWithResolutions.map(film => ({
      ...film,
      videoUrl: convertToFullUrl(film.videoUrl),
      posterUrl: convertToFullUrl(film.posterUrl),
      originalVideoUrl: convertToFullUrl(film.originalVideoUrl)
    }));
    
    const totalCount = await Video.countDocuments({ type: 'film' });
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return res.status(200).json({
      status: true,
      message: 'Random films retrieved successfully.',
      films: filmsWithConvertedUrls,
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
      return addProgressToItem(req.userId, film);
    });

    // Add resolutions to all films efficiently
    const filmsWithResolutions = addVideoResolutionsToArray(filmsWithProgress);

    // Convert URLs to full Azure CDN format
    const filmsWithConvertedUrls = filmsWithResolutions.map(film => ({
      ...film,
      videoUrl: convertToFullUrl(film.videoUrl),
      posterUrl: convertToFullUrl(film.posterUrl),
      originalVideoUrl: convertToFullUrl(film.originalVideoUrl)
    }));

    return res.status(200).json({
      status: true,
      message: 'Popular films retrieved successfully.',
      films: filmsWithConvertedUrls
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get popular films.', err.message);
  }
};

// ADMIN APIs - Get all films with pagination
const getAllFilms = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    
    const pipeline = [
      { $match: { type: 'film' } },
      { $skip: pagination.skip },
      { $limit: pagination.perPage },
      { $sort: { createdAt: -1 } }
    ];
    
    const films = await Video.aggregate(pipeline);
    
    // Convert URLs to full Azure CDN format
    const filmsWithConvertedUrls = films.map(film => ({
      ...film,
      videoUrl: convertToFullUrl(film.videoUrl),
      posterUrl: convertToFullUrl(film.posterUrl),
      originalVideoUrl: convertToFullUrl(film.originalVideoUrl)
    }));
    
    const totalCount = await Video.countDocuments({ type: 'film' });
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return successResponse(res, 200, 'Films retrieved successfully.', {
      films: filmsWithConvertedUrls,
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
    return errorResponse(res, 500, 'Failed to get films.', err.message);
  }
};

// ADMIN API - Get single film by ID
const getFilmById = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid film ID.');
    }

    const film = await Video.findOne({ _id: id, type: 'film' });
    if (!film) {
      return errorResponse(res, 404, 'Film not found.');
    }

    // Convert URLs to full Azure CDN format
    const filmWithConvertedUrls = {
      ...film.toObject(),
      videoUrl: convertToFullUrl(film.videoUrl),
      posterUrl: convertToFullUrl(film.posterUrl),
      originalVideoUrl: convertToFullUrl(film.originalVideoUrl)
    };

    return successResponse(res, 200, 'Film retrieved successfully.', { film: filmWithConvertedUrls });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get film.', err.message);
  }
};

// ADMIN API - Update film
const updateFilm = async (req, res) => {
  try {
    const { id } = req.query;
    const { title, description, posterUrl, videoUrl, originalVideoUrl, resolutions, length } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid film ID.');
    }

    const film = await Video.findOne({ _id: id, type: 'film' });
    if (!film) {
      return errorResponse(res, 404, 'Film not found.');
    }

    // Update fields if provided
    if (title !== undefined) film.title = title;
    if (description !== undefined) film.description = description;
    if (posterUrl !== undefined) film.posterUrl = posterUrl;
    if (videoUrl !== undefined) film.videoUrl = videoUrl;
    if (originalVideoUrl !== undefined) film.originalVideoUrl = originalVideoUrl;
    if (resolutions !== undefined) film.resolutions = resolutions;
    if (length !== undefined) film.length = length;

    await film.save();

    return successResponse(res, 200, 'Film updated successfully.', { film });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update film.', err.message);
  }
};

// ADMIN API - Delete film
const deleteFilm = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid film ID.');
    }

    const film = await Video.findOne({ _id: id, type: 'film' });
    if (!film) {
      return errorResponse(res, 404, 'Film not found.');
    }

    await Video.findByIdAndDelete(id);

    // Also delete related watch progress
    await WatchProgress.deleteMany({ videoId: id });

    return successResponse(res, 200, 'Film deleted successfully.');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete film.', err.message);
  }
};

module.exports = { 
  getRandomFilms, 
  getPopularFilms,
  // Admin APIs
  getAllFilms,
  getFilmById,
  updateFilm,
  deleteFilm
}; 