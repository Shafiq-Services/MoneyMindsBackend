const Series = require('../models/series');
const Video = require('../models/video');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const { addProgressToItem } = require('../utils/progressHelper');
const { convertToFullUrl } = require('../utils/urlHelper');

// POST /api/series
// Body: { title, description, posterUrl }
const addSeries = async (req, res) => {
  try {
    const { title, description, posterUrl } = req.body;
    if (!title) {
      return errorResponse(res, 400, 'title is required.');
    }
    const series = await Series.create({ title, description, posterUrl });
    
    // Broadcast new series release to all users
    await socketManager.broadcastNewSeriesContentRelease(series, series.title);
    
    return res.status(201).json({ status: true, message: 'Series created successfully.', series });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to create series.', err.message);
  }
};

const getRandomSeries = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    
    // Use aggregation for efficient random sampling with episode lookup
    const pipeline = [
      { $sample: { size: pagination.perPage * 10 } }, // Sample more for better randomness
      { $skip: pagination.skip },
      { $limit: pagination.perPage },
      {
        $lookup: {
          from: 'videos',
          let: { seriesId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$seriesId', '$$seriesId'] },
                    { $eq: ['$type', 'episode'] }
                  ]
                }
              }
            },
            {
              $group: {
                _id: '$seasonNumber',
                episodes: {
                  $push: {
                    _id: '$_id',
                    title: '$title',
                    description: '$description',
                    episodeNumber: '$episodeNumber',
                    videoUrl: '$videoUrl',
                    posterUrl: '$posterUrl',
                    resolutions: '$resolutions',
                    length: '$length',
                    createdAt: '$createdAt'
                  }
                }
              }
            },
            {
              $sort: { '_id': 1 }
            },
            {
              $project: {
                seasonNumber: '$_id',
                episodes: {
                  $sortArray: {
                    input: '$episodes',
                    sortBy: { episodeNumber: 1 }
                  }
                },
                _id: 0
              }
            }
          ],
          as: 'seasons'
        }
      }
    ];
    
    const series = await Series.aggregate(pipeline);
    
    // Add watch progress to each episode and convert URLs
    const seriesWithProgress = series.map(seriesItem => ({
      ...seriesItem,
      posterUrl: convertToFullUrl(seriesItem.posterUrl),
      seasons: seriesItem.seasons.map(season => ({
        ...season,
        episodes: season.episodes.map(episode => {
          const episodeWithProgress = addProgressToItem(req.userId, episode);
          return {
            ...episodeWithProgress,
            videoUrl: convertToFullUrl(episodeWithProgress.videoUrl),
            posterUrl: convertToFullUrl(episodeWithProgress.posterUrl)
          };
        })
      }))
    }));
    
    const totalCount = await Series.countDocuments();
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return res.status(200).json({
      status: true,
      message: 'Random series retrieved successfully.',
      series: seriesWithProgress,
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
    return errorResponse(res, 500, 'Failed to get random series.', err.message);
  }
};

// ADMIN APIs - Get all series with pagination
const getAllSeries = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    
    const pipeline = [
      { $skip: pagination.skip },
      { $limit: pagination.perPage },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'videos',
          let: { seriesId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$seriesId', '$$seriesId'] },
                    { $eq: ['$type', 'episode'] }
                  ]
                }
              }
            },
            { $count: 'total' }
          ],
          as: 'episodeCount'
        }
      },
      {
        $addFields: {
          totalEpisodes: { $ifNull: [{ $arrayElemAt: ['$episodeCount.total', 0] }, 0] }
        }
      },
      { $project: { episodeCount: 0 } }
    ];
    
    const series = await Series.aggregate(pipeline);
    const totalCount = await Series.countDocuments();
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    // Convert posterUrl in each series
    const seriesWithConvertedUrls = series.map(seriesItem => ({
      ...seriesItem,
      posterUrl: convertToFullUrl(seriesItem.posterUrl)
    }));

    return successResponse(res, 200, 'Series retrieved successfully.', {
      series: seriesWithConvertedUrls,
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
    return errorResponse(res, 500, 'Failed to get series.', err.message);
  }
};

// ADMIN API - Get single series by ID
const getSeriesById = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid series ID.');
    }

    const series = await Series.findById(id);
    if (!series) {
      return errorResponse(res, 404, 'Series not found.');
    }

    // Get episodes for this series
    const episodes = await Video.find({ 
      seriesId: id, 
      type: 'episode' 
    }).sort({ seasonNumber: 1, episodeNumber: 1 });

    // Convert URLs in series and episodes
    const seriesWithConvertedUrls = {
      ...series.toObject(),
      posterUrl: convertToFullUrl(series.posterUrl),
      episodes: episodes.map(episode => ({
        ...episode.toObject(),
        videoUrl: convertToFullUrl(episode.videoUrl),
        posterUrl: convertToFullUrl(episode.posterUrl)
      }))
    };

    return successResponse(res, 200, 'Series retrieved successfully.', {
      series: seriesWithConvertedUrls
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get series.', err.message);
  }
};

// ADMIN API - Update series
const updateSeries = async (req, res) => {
  try {
    const { id } = req.query;
    const { title, description, posterUrl } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid series ID.');
    }

    const series = await Series.findById(id);
    if (!series) {
      return errorResponse(res, 404, 'Series not found.');
    }

    // Update fields if provided
    if (title !== undefined) series.title = title;
    if (description !== undefined) series.description = description;
    if (posterUrl !== undefined) series.posterUrl = posterUrl;

    await series.save();

    return successResponse(res, 200, 'Series updated successfully.', { series });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update series.', err.message);
  }
};

// ADMIN API - Delete series
const deleteSeries = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid series ID.');
    }

    const series = await Series.findById(id);
    if (!series) {
      return errorResponse(res, 404, 'Series not found.');
    }

    // Check if series has episodes
    const episodeCount = await Video.countDocuments({ seriesId: id, type: 'episode' });
    if (episodeCount > 0) {
      return errorResponse(res, 400, `Cannot delete series. It has ${episodeCount} episodes. Delete episodes first.`);
    }

    await Series.findByIdAndDelete(id);

    return successResponse(res, 200, 'Series deleted successfully.');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete series.', err.message);
  }
};

module.exports = { 
  addSeries, 
  getRandomSeries,
  // Admin APIs
  getAllSeries,
  getSeriesById,
  updateSeries,
  deleteSeries
}; 