const Video = require('../models/video');
const Series = require('../models/series');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const { fetchResolutionsFromVideoUrl } = require('../utils/videoResolutions');
const { getVideoResolution } = require('../utils/ffmpegTranscoder');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

// Function to calculate video duration from video URL
const calculateVideoDuration = async (videoUrl) => {
  try {
    // Download video to temp file
    const tempPath = path.join(__dirname, '../temp', `temp_${Date.now()}.mp4`);
    
    // Ensure temp directory exists
    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download video file
    const downloadVideo = (url, filePath) => {
      return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filePath);
        
        protocol.get(url, (response) => {
          if (response.statusCode !== 200) {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }
          
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        }).on('error', reject);
      });
    };

    await downloadVideo(videoUrl, tempPath);
    
    // Read video file as buffer
    const videoBuffer = fs.readFileSync(tempPath);
    
    // Calculate duration using existing ffmpeg utility
    const { duration } = await getVideoResolution(videoBuffer);
    
    // Clean up temp file
    fs.unlinkSync(tempPath);
    
    return Math.round(duration); // Return duration in seconds, rounded
  } catch (error) {
    console.error('Error calculating video duration:', error);
    return 0; // Return 0 if calculation fails
  }
};

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
      posterUrl,
      length
    } = req.body;

    if (!videoUrl || !type) {
      return errorResponse(res, 400, 'videoUrl and type are required.');
    }

    let episodeNumber = undefined;
    let series = null;
    
    if (type === 'episode') {
      if (!seriesId || !seasonNumber) {
        return errorResponse(res, 400, 'seriesId and seasonNumber are required for episodes.');
      }
      // Validate seriesId exists and get series info
      series = await Series.findById(seriesId);
      if (!series) {
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
    console.log('🎬 Fetching resolutions for video:', title || 'Untitled');
    const resolutions = await fetchResolutionsFromVideoUrl(videoUrl);
    console.log('📊 Resolutions found:', resolutions);

    // Calculate video duration if not provided
    let videoDuration = length || 0;
    if (!length || length === 0) {
      console.log('📏 Calculating video duration from video URL...');
      videoDuration = await calculateVideoDuration(videoUrl);
      console.log('⏱️ Video duration calculated:', videoDuration, 'seconds');
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
      posterUrl,
      length: videoDuration
    });

    // Broadcast notifications based on content type
    if (type === 'film') {
      await socketManager.broadcastNewFilmRelease(video);
    } else if (type === 'episode' && series) {
      await socketManager.broadcastNewSeriesContentRelease(video, series.title);
    }

    // Order the response fields as requested
    const videoObj = video.toObject();
    const orderedVideo = {
      _id: videoObj._id,
      title: videoObj.title,
      description: videoObj.description,
      type: videoObj.type,
      videoUrl: videoObj.videoUrl,
      posterUrl: videoObj.posterUrl,
      length: videoDuration,
      createdAt: videoObj.createdAt,
      resolutions: videoObj.resolutions,
      watchedProgress: (() => {
        const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][videoObj._id] ? socketManager.videoProgress[req.userId][videoObj._id] : null;
        return progress ? progress.percentage : 0;
      })(),
      watchSeconds: (() => {
        const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][videoObj._id] ? socketManager.videoProgress[req.userId][videoObj._id] : null;
        return progress ? progress.seconds : 0;
      })(),
      totalDuration: (() => {
        const progress = socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][videoObj._id] ? socketManager.videoProgress[req.userId][videoObj._id] : null;
        return progress ? progress.totalDuration : 0;
      })(),
      ...Object.fromEntries(Object.entries(videoObj).filter(([k]) => !['_id','title','description','type','videoUrl','posterUrl','length','createdAt','resolutions'].includes(k)))
    };

    return res.status(201).json({ status: true, message: 'Video added successfully.', video: orderedVideo });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to add video.', err.message);
  }
};

const getRandomSuggestion = async (req, res) => {
  try {
    const userId = req.userId;
    // Randomly choose between film or series
    const contentTypes = ['film', 'series'];
    const randomType = contentTypes[Math.floor(Math.random() * contentTypes.length)];
    let suggestion = null;

    if (randomType === 'film') {
      // Find a random film document with proper metadata
      const count = await Video.countDocuments({ 
        type: 'film',
        title: { $exists: true, $ne: '', $ne: null },
        description: { $exists: true, $ne: null },
        posterUrl: { $exists: true, $ne: null }
      });
      if (count > 0) {
        const random = Math.floor(Math.random() * count);
        const film = await Video.findOne({ 
          type: 'film',
          title: { $exists: true, $ne: '', $ne: null },
          description: { $exists: true, $ne: null },
          posterUrl: { $exists: true, $ne: null }
        }).skip(random);
        if (film) {
          // Add watch progress if available
          let watchProgress = 0;
          if (socketManager.videoProgress[req.userId] && socketManager.videoProgress[req.userId][film._id]) {
            watchProgress = socketManager.videoProgress[req.userId][film._id].percentage || 0;
          }
          
          // Explicitly structure the response to ensure all fields are present
          suggestion = {
            _id: film._id,
            title: film.title || '',
            description: film.description || '',
            type: film.type,
            videoUrl: film.videoUrl,
            posterUrl: film.posterUrl || '',
            originalVideoUrl: film.originalVideoUrl,
            resolutions: film.resolutions || [],
            length: film.length || 0,
            createdAt: film.createdAt,
            watchProgress,
            contentType: 'film'
          };
        }
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
                      length: '$length',
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
        if (progress.percentage > 0) {
          // Get video details
          const video = await Video.findById(videoId);
          if (video) {
            continueWatching.push({
              ...video.toObject(),
              watchProgress: progress.percentage,
              watchSeconds: progress.seconds,
              totalDuration: progress.totalDuration,
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