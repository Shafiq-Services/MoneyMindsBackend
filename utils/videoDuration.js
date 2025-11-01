const { getVideoResolution } = require('./ffmpegTranscoder');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const ffmpeg = require('fluent-ffmpeg');
const os = require('os');

// Use custom binaries only on Linux (e.g., Azure server)
// On macOS and Windows, use system-installed ffmpeg
if (os.platform() === 'linux') {
  const customFfmpegPath = path.join(__dirname, '../bin', 'ffmpeg');
  const customFfprobePath = path.join(__dirname, '../bin', 'ffprobe');
  
  // Only use custom binaries if they exist
  if (fs.existsSync(customFfmpegPath) && fs.existsSync(customFfprobePath)) {
    ffmpeg.setFfmpegPath(customFfmpegPath);
    ffmpeg.setFfprobePath(customFfprobePath);
  }
}

/**
 * Calculate video duration from video URL
 * Supports both direct video files and HLS (.m3u8) playlists
 * @param {string} videoUrl - The video URL to analyze
 * @returns {Promise<number>} Duration in seconds (rounded)
 */
const calculateVideoDuration = async (videoUrl) => {
  try {
    console.log(`📏 Calculating video duration for: ${videoUrl}`);

    // Method 1: Try HLS playlist parsing first (for .m3u8 files)
    if (videoUrl.endsWith('.m3u8')) {
      console.log('🎬 Detected HLS playlist, parsing segments...');
      const duration = await calculateHLSDuration(videoUrl);
      if (duration > 0) {
        console.log(`⏱️ HLS duration calculated: ${duration} seconds`);
        return Math.round(duration);
      }
    }

    // Method 2: Try ffprobe for direct video files
    console.log('🔍 Trying ffprobe for direct video analysis...');
    const duration = await calculateDirectVideoDuration(videoUrl);
    if (duration > 0) {
      console.log(`⏱️ Direct video duration calculated: ${duration} seconds`);
      return Math.round(duration);
    }

    // Method 3: Download and analyze video file (fallback)
    console.log('📥 Downloading video for analysis...');
    const downloadDuration = await calculateVideoByDownload(videoUrl);
    console.log(`⏱️ Downloaded video duration calculated: ${downloadDuration} seconds`);
    return Math.round(downloadDuration);

  } catch (error) {
    console.error('❌ Error calculating video duration:', error.message);
    console.log('⚠️ Returning fallback duration of 0 seconds');
    return 0; // Return 0 if all methods fail
  }
};

/**
 * Calculate duration from HLS playlist by parsing segment durations
 * @param {string} hlsUrl - HLS playlist URL
 * @returns {Promise<number>} Total duration in seconds
 */
const calculateHLSDuration = async (hlsUrl) => {
  try {
    const response = await axios.get(hlsUrl, { timeout: 10000 });
    const lines = response.data.split('\n');
    let totalDuration = 0;

    for (const line of lines) {
      if (line.trim().startsWith('#EXTINF:')) {
        const durationMatch = line.match(/#EXTINF:([\d.]+)/);
        if (durationMatch) {
          totalDuration += parseFloat(durationMatch[1]);
        }
      }
    }

    return totalDuration;
  } catch (error) {
    console.log('Failed to parse HLS duration:', error.message);
    return 0;
  }
};

/**
 * Calculate duration using ffprobe directly on video URL
 * @param {string} videoUrl - Direct video URL
 * @returns {Promise<number>} Duration in seconds
 */
const calculateDirectVideoDuration = async (videoUrl) => {
  return new Promise((resolve) => {
    ffmpeg.ffprobe(videoUrl, (err, metadata) => {
      if (!err && metadata && metadata.format && metadata.format.duration) {
        resolve(metadata.format.duration);
      } else {
        console.log('Could not get duration via direct ffprobe:', err?.message);
        resolve(0);
      }
    });
  });
};

/**
 * Calculate duration by downloading video and analyzing with ffmpeg
 * @param {string} videoUrl - Video URL to download
 * @returns {Promise<number>} Duration in seconds
 */
const calculateVideoByDownload = async (videoUrl) => {
  const tempPath = path.join(__dirname, '../temp', `temp_${Date.now()}.mp4`);
  
  try {
    // Ensure temp directory exists
    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Download video file
    await downloadVideo(videoUrl, tempPath);
    
    // Read video file as buffer
    const videoBuffer = fs.readFileSync(tempPath);
    
    // Calculate duration using existing ffmpeg utility
    const { duration } = await getVideoResolution(videoBuffer);
    
    return duration || 0;

  } catch (error) {
    console.error('Error in download method:', error.message);
    return 0;
  } finally {
    // Clean up temp file
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
  }
};

/**
 * Download video file to local path
 * @param {string} url - Video URL
 * @param {string} filePath - Local file path to save
 * @returns {Promise<void>}
 */
const downloadVideo = (url, filePath) => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(filePath);
    
    const request = protocol.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    });

    request.on('error', (error) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject(error);
    });

    file.on('error', (error) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      reject(error);
    });
  });
};

module.exports = {
  calculateVideoDuration,
  calculateHLSDuration,
  calculateDirectVideoDuration
}; 