const Video = require('../models/video');
const Series = require('../models/series');
const WatchProgress = require('../models/watchProgress');
const { parsePaginationParams } = require('../utils/pagination');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');

// ADMIN API - Get all episodes with pagination
const getAllEpisodes = async (req, res) => {
  try {
    const pagination = parsePaginationParams(req.query);
    const { seriesId, seasonNumber } = req.query;
    
    let matchCondition = { type: 'episode' };
    if (seriesId && mongoose.Types.ObjectId.isValid(seriesId)) {
      matchCondition.seriesId = new mongoose.Types.ObjectId(seriesId);
    }
    if (seasonNumber) {
      matchCondition.seasonNumber = parseInt(seasonNumber);
    }
    
    const pipeline = [
      { $match: matchCondition },
      { $skip: pagination.skip },
      { $limit: pagination.perPage },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: 'series',
          localField: 'seriesId',
          foreignField: '_id',
          as: 'series'
        }
      },
      {
        $addFields: {
          seriesTitle: { $arrayElemAt: ['$series.title', 0] }
        }
      },
      { $project: { series: 0 } }
    ];
    
    const episodes = await Video.aggregate(pipeline);
    const totalCount = await Video.countDocuments(matchCondition);
    const totalPages = Math.ceil(totalCount / pagination.perPage);

    return successResponse(res, 200, 'Episodes retrieved successfully.', {
      episodes,
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
    return errorResponse(res, 500, 'Failed to get episodes.', err.message);
  }
};

// ADMIN API - Get single episode by ID
const getEpisodeById = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid episode ID.');
    }

    const episode = await Video.findOne({ _id: id, type: 'episode' }).populate('seriesId', 'title description');
    if (!episode) {
      return errorResponse(res, 404, 'Episode not found.');
    }

    return successResponse(res, 200, 'Episode retrieved successfully.', { episode });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get episode.', err.message);
  }
};

// ADMIN API - Update episode
const updateEpisode = async (req, res) => {
  try {
    const { id } = req.query;
    const { 
      title, 
      description, 
      seriesId, 
      seasonNumber, 
      episodeNumber, 
      videoUrl, 
      originalVideoUrl, 
      resolutions, 
      posterUrl, 
      length 
    } = req.body;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid episode ID.');
    }

    const episode = await Video.findOne({ _id: id, type: 'episode' });
    if (!episode) {
      return errorResponse(res, 404, 'Episode not found.');
    }

    // Validate seriesId if provided
    if (seriesId && mongoose.Types.ObjectId.isValid(seriesId)) {
      const series = await Series.findById(seriesId);
      if (!series) {
        return errorResponse(res, 400, 'Invalid series ID.');
      }
      episode.seriesId = seriesId;
    }

    // Update fields if provided
    if (title !== undefined) episode.title = title;
    if (description !== undefined) episode.description = description;
    if (seasonNumber !== undefined) episode.seasonNumber = seasonNumber;
    if (episodeNumber !== undefined) episode.episodeNumber = episodeNumber;
    if (videoUrl !== undefined) episode.videoUrl = videoUrl;
    if (originalVideoUrl !== undefined) episode.originalVideoUrl = originalVideoUrl;
    if (resolutions !== undefined) episode.resolutions = resolutions;
    if (posterUrl !== undefined) episode.posterUrl = posterUrl;
    if (length !== undefined) episode.length = length;

    await episode.save();

    return successResponse(res, 200, 'Episode updated successfully.', { episode });
  } catch (err) {
    return errorResponse(res, 500, 'Failed to update episode.', err.message);
  }
};

// ADMIN API - Delete episode
const deleteEpisode = async (req, res) => {
  try {
    const { id } = req.query;
    
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return errorResponse(res, 400, 'Invalid episode ID.');
    }

    const episode = await Video.findOne({ _id: id, type: 'episode' });
    if (!episode) {
      return errorResponse(res, 404, 'Episode not found.');
    }

    await Video.findByIdAndDelete(id);

    // Also delete related watch progress
    await WatchProgress.deleteMany({ videoId: id });

    return successResponse(res, 200, 'Episode deleted successfully.');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete episode.', err.message);
  }
};

module.exports = {
  getAllEpisodes,
  getEpisodeById,
  updateEpisode,
  deleteEpisode
};
