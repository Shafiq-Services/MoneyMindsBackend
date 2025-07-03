const Series = require('../models/series');
const Video = require('../models/video');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');

// POST /api/series
// Body: { title, description, posterUrl }
const addSeries = async (req, res) => {
  try {
    const { title, description, posterUrl } = req.body;
    if (!title) {
      return errorResponse(res, 400, 'title is required.');
    }
    const series = await Series.create({ title, description, posterUrl });
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
    
    // Add watch progress to each episode
    const seriesWithProgress = series.map(seriesItem => ({
      ...seriesItem,
      seasons: seriesItem.seasons.map(season => ({
        ...season,
        episodes: season.episodes.map(episode => {
          const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][episode._id] ? socketManager.videoProgress[req.userId][episode._id] : null;
          return {
            ...episode,
            watchProgress: progress ? progress.percentage : 0,
            watchSeconds: progress ? progress.seconds : 0,
            totalDuration: progress ? progress.totalDuration : 0
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

module.exports = { addSeries, getRandomSeries }; 