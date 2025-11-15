const Video = require('../models/video');
const WatchProgress = require('../models/watchProgress');
const Series = require('../models/series');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');
const { fetchResolutionsFromVideoUrl } = require('../utils/videoResolutions');
const { calculateVideoDuration } = require('../utils/videoDuration');
const { addProgressToItem } = require('../utils/progressHelper');
const { convertToFullUrl } = require('../utils/urlHelper');



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
    const videoWithProgress = addProgressToItem(req.userId, {
      _id: videoObj._id,
      title: videoObj.title,
      description: videoObj.description,
      type: videoObj.type,
      videoUrl: videoObj.videoUrl,
      posterUrl: videoObj.posterUrl,
      length: videoDuration,
      createdAt: videoObj.createdAt,
      resolutions: videoObj.resolutions,
      ...Object.fromEntries(Object.entries(videoObj).filter(([k]) => !['_id','title','description','type','videoUrl','posterUrl','length','createdAt','resolutions'].includes(k)))
    });

    const orderedVideo = {
      _id: videoWithProgress._id,
      title: videoWithProgress.title,
      description: videoWithProgress.description,
      type: videoWithProgress.type,
      videoUrl: convertToFullUrl(videoWithProgress.videoUrl),
      posterUrl: convertToFullUrl(videoWithProgress.posterUrl),
      length: videoWithProgress.length,
      createdAt: videoWithProgress.createdAt,
      resolutions: videoWithProgress.resolutions,
      watchedProgress: videoWithProgress.watchedProgress,
      watchSeconds: videoWithProgress.watchSeconds,
      totalDuration: videoWithProgress.totalDuration,
      ...Object.fromEntries(Object.entries(videoWithProgress).filter(([k]) => !['_id','title','description','type','videoUrl','posterUrl','length','createdAt','resolutions','watchedProgress','watchSeconds','totalDuration'].includes(k)))
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
            videoUrl: convertToFullUrl(film.videoUrl),
            posterUrl: convertToFullUrl(film.posterUrl || ''),
            originalVideoUrl: convertToFullUrl(film.originalVideoUrl),
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
    console.log('🎬 [Continue Watching] Starting API call for user:', userId);
    
    // Query database directly for user's watch progress (including 0% progress)
    const watchProgressRecords = await WatchProgress.find({ 
      userId: new mongoose.Types.ObjectId(userId),
      contentType: 'video' // Only get video progress (not lessons or chat messages)
    })
    .sort({ lastUpdated: -1 }) // Most recently updated first
    .lean();
    
    console.log('📊 [Continue Watching] Found', watchProgressRecords.length, 'progress records in database');
    
    const continueWatching = [];
    
    // Process each progress record
    for (const progressRecord of watchProgressRecords) {
      try {
        // Get video details from database
        const video = await Video.findById(progressRecord.videoId).lean();
        
        if (video) {
          console.log('📹 [Continue Watching] Processing:', video.title, '(' + progressRecord.percentage + '% watched)');
          
          continueWatching.push({
            ...video,
            watchProgress: progressRecord.percentage || 0,
            watchSeconds: progressRecord.seconds || 0,
            totalDuration: progressRecord.totalDuration || video.length || 0,
            contentType: video.type === 'film' ? 'film' : 'episode',
            lastWatchedAt: progressRecord.lastUpdated
          });
        } else {
          console.log('⚠️ [Continue Watching] Video not found for progress record:', progressRecord.videoId);
        }
      } catch (videoError) {
        console.error('❌ [Continue Watching] Error processing video:', progressRecord.videoId, videoError.message);
      }
    }
    
    // Sort by last watched time (most recent first), then by progress percentage
    continueWatching.sort((a, b) => {
      // First sort by last watched time (most recent first)
      const timeCompare = new Date(b.lastWatchedAt || 0) - new Date(a.lastWatchedAt || 0);
      if (timeCompare !== 0) return timeCompare;
      
      // If same time, sort by progress percentage (highest first)
      return b.watchProgress - a.watchProgress;
    });
    
    // Limit to 20 items as per original implementation
    const limitedResults = continueWatching.slice(0, 20);

    // Convert URLs to full Azure CDN format
    const resultsWithConvertedUrls = limitedResults.map(video => ({
      ...video,
      videoUrl: convertToFullUrl(video.videoUrl),
      posterUrl: convertToFullUrl(video.posterUrl),
      originalVideoUrl: convertToFullUrl(video.originalVideoUrl)
    }));

    console.log('✅ [Continue Watching] Returning', resultsWithConvertedUrls.length, 'videos');

    return res.status(200).json({
      status: true,
      message: 'Continue watching content retrieved successfully.',
      continueWatching: resultsWithConvertedUrls
    });
  } catch (err) {
    console.error('❌ [Continue Watching] Error:', err.message);
    return errorResponse(res, 500, 'Failed to get continue watching content.', err.message);
  }
};

module.exports = { 
  postVideo, 
  getRandomSuggestion,
  getContinueWatching
}; 