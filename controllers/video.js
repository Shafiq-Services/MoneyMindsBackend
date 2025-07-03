const Video = require('../models/video');
const Series = require('../models/series');
const axios = require('axios');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');

// Helper to fetch resolutions from HLS master playlist
async function fetchResolutionsFromM3U8(masterUrl) {
  try {
    const res = await axios.get(masterUrl, { timeout: 5000 }); // 5 seconds timeout
    const lines = res.data.split('\n');
    const resolutions = [];
    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const match = line.match(/RESOLUTION=(\d+)x(\d+)/);
        if (match) {
          resolutions.push(parseInt(match[2], 10)); // height
        }
      }
    }
    return resolutions;
  } catch (err) {
    return [];
  }
}

// POST /api/video
const postVideo = async (req, res) => {
  try {
    const {
      title,
      description,
      type,
      seriesId,
      seasonNumber,
      videoUrl,
      posterUrl
    } = req.body;

    if (!videoUrl || !type) {
      return errorResponse(res, 400, 'videoUrl and type are required.');
    }

    let episodeNumber = undefined;
    if (type === 'episode') {
      if (!seriesId || !seasonNumber) {
        return errorResponse(res, 400, 'seriesId and seasonNumber are required for episodes.');
      }
      // Validate seriesId exists
      const seriesExists = await Series.exists({ _id: seriesId });
      if (!seriesExists) {
        return errorResponse(res, 400, 'Invalid seriesId: series not found.');
      }
      // Find the current max episodeNumber in this season
      const lastEpisode = await Video.findOne({
        type: 'episode',
        seriesId,
        seasonNumber
      }).sort({ episodeNumber: -1 });
      episodeNumber = lastEpisode && lastEpisode.episodeNumber ? lastEpisode.episodeNumber + 1 : 1;
    }

    // Fetch resolutions from the HLS master playlist
    let resolutions = [];
    if (videoUrl && videoUrl.endsWith('.m3u8')) {
      resolutions = await fetchResolutionsFromM3U8(videoUrl);
    }

    const video = await Video.create({
      title,
      description,
      type,
      seriesId,
      seasonNumber,
      episodeNumber,
      videoUrl,
      resolutions,
      posterUrl
    });

    // Order the response fields as requested
    const videoObj = video.toObject();
    const orderedVideo = {
      _id: videoObj._id,
      title: videoObj.title,
      description: videoObj.description,
      type: videoObj.type,
      videoUrl: videoObj.videoUrl,
      posterUrl: videoObj.posterUrl,
      createdAt: videoObj.createdAt,
      resolutions: videoObj.resolutions,
      watchedProgress: socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][videoObj._id] ? socketManager.videoProgress[req.userId][videoObj._id] : 0,
      ...Object.fromEntries(Object.entries(videoObj).filter(([k]) => !['_id','title','description','type','videoUrl','posterUrl','createdAt','resolutions'].includes(k)))
    };

    return res.status(201).json({ status: true, message: 'Video added successfully.', video: orderedVideo });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to add video.', err.message);
  }
};

const getRandomSuggestion = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.userId);
    
    // Randomly choose between film or series
    const contentTypes = ['film', 'series'];
    const randomType = contentTypes[Math.floor(Math.random() * contentTypes.length)];
    
    let suggestion = null;
    
    if (randomType === 'film') {
      // Use aggregation for efficient random film selection with watch progress
      const filmPipeline = [
        { $match: { type: 'film' } },
        { $sample: { size: 1 } },
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
      
      const films = await Video.aggregate(filmPipeline);
      if (films.length > 0) {
        suggestion = films[0];
        suggestion.contentType = 'film';
      }
    } else {
      // Use aggregation for efficient random series selection with episodes and watch progress
      const seriesPipeline = [
        { $sample: { size: 1 } },
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
      
      const seriesResult = await Series.aggregate(seriesPipeline);
      if (seriesResult.length > 0) {
        suggestion = seriesResult[0];
        suggestion.contentType = 'series';
      }
    }

    if (!suggestion) {
      return errorResponse(res, 404, 'No content available for suggestion.');
    }

    return res.status(200).json({
      status: true,
      message: 'Random suggestion retrieved successfully.',
      suggestion
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get random suggestion.', err.message);
  }
};

const getContinueWatching = async (req, res) => {
  try {
    const userId = req.userId;
    
    // Get all videos with watch progress > 0
    const continueWatching = [];
    
    // Check in-memory progress for films
    if (socketManager.videoProgress[userId]) {
      for (const [videoId, progress] of Object.entries(socketManager.videoProgress[userId])) {
        if (progress > 0) {
          // Get video details
          const video = await Video.findById(videoId);
          if (video) {
            continueWatching.push({
              ...video.toObject(),
              watchProgress: progress,
              contentType: video.type === 'film' ? 'film' : 'episode'
            });
          }
        }
      }
    }
    
    // Sort by watch progress (highest first) and then by last watched time
    continueWatching.sort((a, b) => {
      if (b.watchProgress !== a.watchProgress) {
        return b.watchProgress - a.watchProgress;
      }
      return new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0);
    });
    
    // Limit to 20 items
    const limitedResults = continueWatching.slice(0, 20);

    return res.status(200).json({
      status: true,
      message: 'Continue watching content retrieved successfully.',
      continueWatching: limitedResults
    });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get continue watching content.', err.message);
  }
};

module.exports = { 
  postVideo, 
  getRandomSuggestion,
  getContinueWatching
}; 