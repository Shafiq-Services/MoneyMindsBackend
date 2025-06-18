const Series = require('../models/series');
const Video = require('../models/video');
const WatchProgress = require('../models/watch-progress');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');

// POST /api/series
// Body: { title, description, posterUrl }
const addSeries = async (req, res) => {
  try {
    const { title, description, posterUrl } = req.body;
    if (!title) {
      return res.status(400).json({ status: false, message: 'title is required.' });
    }
    const series = await Series.create({ title, description, posterUrl });
    return res.status(201).json({ status: true, message: 'Series created successfully.', series });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to create series.', error: err.message });
  }
};

const getRandomSeries = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    const userId = new mongoose.Types.ObjectId(req.userId);
    
    // Use aggregation for efficient random sampling with episode lookup and watch progress
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
                as: 'watchProgressData'
              }
            },
            {
              $addFields: {
                watchProgress: {
                  $cond: {
                    if: { $gt: [{ $size: '$watchProgressData' }, 0] },
                    then: { $arrayElemAt: ['$watchProgressData.progress', 0] },
                    else: 0
                  }
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
                    createdAt: '$createdAt',
                    watchProgress: '$watchProgress'
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
    const totalCount = await Series.countDocuments();
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return res.status(200).json({
      status: true,
      message: 'Random series retrieved successfully.',
      series,
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
    return res.status(500).json({
      status: false,
      message: 'Failed to get random series.',
      error: err.message
    });
  }
};

module.exports = { addSeries, getRandomSeries }; 