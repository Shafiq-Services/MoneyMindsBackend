const axios = require('axios');

/**
 * Fetches available resolutions from HLS master playlist
 * @param {string} masterUrl - The master .m3u8 playlist URL
 * @returns {Array<number>} Array of available resolutions (heights)
 */
async function fetchResolutionsFromVideoUrl(masterUrl) {
  try {
    if (!masterUrl || !masterUrl.endsWith('.m3u8')) {
      return [];
    }

    const response = await axios.get(masterUrl, { 
      timeout: 5000,
      headers: {
        'User-Agent': 'VideoResolutionFetcher/1.0'
      }
    });
    
    const lines = response.data.split('\n');
    const resolutions = [];
    
    for (const line of lines) {
      if (line.startsWith('#EXT-X-STREAM-INF:')) {
        const match = line.match(/RESOLUTION=(\d+)x(\d+)/);
        if (match) {
          const height = parseInt(match[2], 10);
          if (height && !resolutions.includes(height)) {
            resolutions.push(height);
          }
        }
      }
    }
    
    // Sort resolutions in descending order (highest first)
    return resolutions.sort((a, b) => b - a);
  } catch (error) {
    console.log(`⚠️ [Video Resolutions] Failed to fetch resolutions from ${masterUrl}:`, error.message);
    return [];
  }
}

/**
 * Adds resolution information to a video object
 * @param {Object} videoObj - Video object that may already contain resolutions
 * @returns {Object} Video object with resolutions array (uses stored resolutions or empty array)
 */
function addVideoResolutions(videoObj) {
  if (!videoObj) {
    return { ...videoObj, resolutions: [] };
  }

  // Use stored resolutions if available, otherwise return empty array
  return {
    ...videoObj,
    resolutions: videoObj.resolutions || []
  };
}

/**
 * Adds resolution information to an array of video objects
 * @param {Array<Object>} videoArray - Array of video objects
 * @returns {Array<Object>} Array of video objects with resolutions (uses stored resolutions)
 */
function addVideoResolutionsToArray(videoArray) {
  if (!Array.isArray(videoArray) || videoArray.length === 0) {
    return videoArray;
  }

  // Simply return the array with stored resolutions - no HTTP requests needed
  return videoArray.map(video => ({
    ...video,
    resolutions: video.resolutions || []
  }));
}

module.exports = {
  fetchResolutionsFromVideoUrl,
  addVideoResolutions,
  addVideoResolutionsToArray
}; 