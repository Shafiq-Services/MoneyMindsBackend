const Video = require('../models/video');
const WatchProgress = require('../models/watch-progress');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');

const getRandomFilms = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    const userId = new mongoose.Types.ObjectId(req.userId);
    
    // Use aggregation for efficient random sampling and pagination with watch progress
    const pipeline = [
      { $match: { type: 'film' } },
      { $sample: { size: pagination.perPage * 10 } }, // Sample more for better randomness
      { $skip: pagination.skip },
      { $limit: pagination.perPage },
      {
        $lookup: {
          from: 'watchprogresses',
          let: { videoId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$videoId', '$$videoId'] },
                    { $eq: ['$userId', userId] }
                  ]
                }
              }
            }
          ],
          as: 'watchProgress'
        }
      },
      {
        $addFields: {
          watchProgress: {
            $cond: {
              if: { $gt: [{ $size: '$watchProgress' }, 0] },
              then: { $arrayElemAt: ['$watchProgress.progress', 0] },
              else: 0
            }
          }
        }
      }
    ];
    
    const films = await Video.aggregate(pipeline);
    const totalCount = await Video.countDocuments({ type: 'film' });
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return res.status(200).json({
      status: true,
      message: 'Random films retrieved successfully.',
      films,
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