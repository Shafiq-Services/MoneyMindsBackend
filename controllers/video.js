const Video = require('../models/video');
const Series = require('../models/series');
const WatchProgress = require('../models/watch-progress');
const axios = require('axios');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');

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
      return res.status(400).json({ status: false, message: 'videoUrl and type are required.' });
    }

    let episodeNumber = undefined;
    if (type === 'episode') {
      if (!seriesId || !seasonNumber) {
        return res.status(400).json({ status: false, message: 'seriesId and seasonNumber are required for episodes.' });
      }
      // Validate seriesId exists
      const seriesExists = await Series.exists({ _id: seriesId });
      if (!seriesExists) {
        return res.status(400).json({ status: false, message: 'Invalid seriesId: series not found.' });
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
      ...Object.fromEntries(Object.entries(videoObj).filter(([k]) => !['_id','title','description','type','videoUrl','posterUrl','createdAt','resolutions'].includes(k)))
    };

    return res.status(201).json({ status: true, message: 'Video added successfully.', video: orderedVideo });
  } catch (err) {
    return res.status(500).json({ status: false, message: 'Failed to add video.', error: err.message });
  }
};

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
    return res.status(500).json({
      status: false,
      message: 'Failed to get random films.',
      error: err.message
    });
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
      return res.status(404).json({
        status: false,
        message: 'No content available for suggestion.'
      });
    }

    return res.status(200).json({
      status: true,
      message: 'Random suggestion retrieved successfully.',
      suggestion
    });
  } catch (err) {
    return res.status(500).json({
      status: false,
      message: 'Failed to get random suggestion.',
      error: err.message
    });
  }
};

module.exports = { 
  postVideo, 
  getRandomFilms, 
  getRandomSeries, 
  getRandomSuggestion 
}; 