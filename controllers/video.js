const Video = require('../models/video');
const Series = require('../models/series');
const axios = require('axios');

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

module.exports = { postVideo }; 