const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { uploadFileSmart } = require('./b2OfficialMultithreaded');
// getB2S3Url no longer needed - storing relative paths only

// Use custom binaries only on Linux (e.g., Azure server)
// On macOS and Windows, use system-installed ffmpeg
if (os.platform() === 'linux') {
  const customFfmpegPath = path.join(__dirname, '../bin', 'ffmpeg');
  const customFfprobePath = path.join(__dirname, '../bin', 'ffprobe');
  
  // Only use custom binaries if they exist
  if (fs.existsSync(customFfmpegPath) && fs.existsSync(customFfprobePath)) {
    ffmpeg.setFfmpegPath(customFfmpegPath);
    ffmpeg.setFfprobePath(customFfprobePath);
    console.log('🎬 [FFmpeg] Using custom Linux binaries from bin/');
  } else {
    console.log('🎬 [FFmpeg] Custom binaries not found, using system FFmpeg');
  }
} else {
  console.log(`🎬 [FFmpeg] Using system FFmpeg on ${os.platform()}`);
}

const getVideoResolution = (videoInput) => {
  return new Promise((resolve, reject) => {
    // videoInput can be either a file path (string) or buffer
    const isFilePath = typeof videoInput === 'string';
    
    if (isFilePath) {
      // Use file path directly - no need to write buffer
      ffmpeg.ffprobe(videoInput, (err, metadata) => {
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream) {
          resolve({
            width: videoStream.width,
            height: videoStream.height,
            duration: metadata.format.duration,
          });
        } else {
          reject(new Error('No video stream found'));
        }
      });
    } else {
      // Legacy support: buffer input (for backward compatibility)
      const tempPath = path.join(__dirname, '../temp', `temp_${Date.now()}.mp4`);
      
      // Ensure temp directory exists
      const tempDir = path.dirname(tempPath);
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      fs.writeFileSync(tempPath, videoInput);

      ffmpeg.ffprobe(tempPath, (err, metadata) => {
        // Clean up temp file
        fs.unlinkSync(tempPath);
        
        if (err) {
          reject(err);
          return;
        }

        const videoStream = metadata.streams.find(stream => stream.codec_type === 'video');
        if (videoStream) {
          resolve({
            width: videoStream.width,
            height: videoStream.height,
            duration: metadata.format.duration,
          });
        } else {
          reject(new Error('No video stream found'));
        }
      });
    }
  });
};

const generateHLSResolutions = (sourceHeight) => {
  const resolutions = [
    { height: 240, bitrate: '500k' },
    { height: 360, bitrate: '800k' },
    { height: 480, bitrate: '1200k' },
    { height: 720, bitrate: '2500k' },
    { height: 1080, bitrate: '5000k' },
    { height: 1440, bitrate: '8000k' },
    { height: 2160, bitrate: '15000k' },
  ];

  // Only include resolutions that are equal or less than source resolution
  return resolutions.filter(res => res.height <= sourceHeight);
};

// Helper function to get video folder based on type
const getVideoFolder = (videoType) => {
  const videoFolders = {
    'film': 'videos/films',
    'episode': 'videos/episodes', 
    'lesson': 'videos/lessons'
  };
  return videoFolders[videoType] || 'videos/films';
};

const transcodeToHLS = async (videoInput, videoId, videoType = 'film', progressCallback = null) => {
  try {
    // videoInput can be either a file path (string) or buffer (for backward compatibility)
    const isFilePath = typeof videoInput === 'string';
    
    const { width, height, duration } = await getVideoResolution(videoInput);
    const resolutions = generateHLSResolutions(height);
    
    // Use system temp directory to avoid issues with spaces in path
    const os = require('os');
    const systemTempDir = os.tmpdir();
    const tempDir = path.join(systemTempDir, 'moneymind-transcoding', videoId);
    const outputDir = path.join(tempDir, 'hls');
    
    console.log(`📁 [FFmpeg] Temp directory: ${tempDir}`);
    console.log(`📁 [FFmpeg] Output directory: ${outputDir}`);
    
    // Create directories
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Use file path directly if available, otherwise use buffer (legacy)
    const inputPath = isFilePath ? videoInput : path.join(tempDir, 'input.mp4');
    if (!isFilePath) {
      // Legacy: save buffer to temp file
      fs.writeFileSync(inputPath, videoInput);
    }

    const masterPlaylist = [];
    const uploadPromises = [];
    let completedResolutions = 0;

    // Get organized video folder path
    const videoFolder = getVideoFolder(videoType);

    // Generate HLS for each resolution
    for (let i = 0; i < resolutions.length; i++) {
      const resolution = resolutions[i];
      const outputPath = path.join(outputDir, `${resolution.height}p`);
      const playlistName = `${resolution.height}p.m3u8`;
      
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }
      
      const segmentPath = path.join(outputPath, 'segment_%03d.ts');
      const playlistOutputPath = path.join(outputPath, playlistName);
      
      console.log(`📹 [FFmpeg] Resolution ${resolution.height}p paths:`);
      console.log(`   Input: ${inputPath}`);
      console.log(`   Output playlist: ${playlistOutputPath}`);
      console.log(`   Segments: ${segmentPath}`);

      await new Promise((resolve, reject) => {
        // Capture loop index in closure
        const resolutionIndex = i;
        const resolutionWeight = 100 / resolutions.length;
        
        const command = ffmpeg(inputPath)
          .outputOptions([
            '-c:v libx264',
            '-c:a aac',
            `-b:v ${resolution.bitrate}`,
            '-b:a 128k',
            `-vf scale=-2:${resolution.height}`,
            '-preset medium',
            '-crf 23',
            '-hls_time 6',
            '-hls_list_size 0',
            '-hls_segment_filename',
            segmentPath,
            '-f hls'
          ])
          .output(playlistOutputPath);

        let lastProgress = 0;
        
        // Parse FFmpeg progress output for real-time updates
        command.on('stderr', (stderrLine) => {
          // FFmpeg outputs progress like: time=00:00:05.00
          const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
          if (timeMatch && duration && progressCallback) {
            const hours = parseInt(timeMatch[1]);
            const minutes = parseInt(timeMatch[2]);
            const seconds = parseInt(timeMatch[3]);
            const centiseconds = parseInt(timeMatch[4]);
            const currentTime = hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
            
            const resolutionProgress = Math.min(100, Math.round((currentTime / duration) * 100));
            
            // Only update if progress changed significantly (avoid spam)
            if (resolutionProgress > lastProgress + 1) {
              lastProgress = resolutionProgress;
              
              // Calculate overall progress across all resolutions
              const overallProgress = Math.round((resolutionIndex / resolutions.length) * 100 + (resolutionProgress * resolutionWeight / 100));
              
              progressCallback({
                resolution: `${resolution.height}p`,
                resolutionProgress: resolutionProgress,
                overallProgress: overallProgress,
                message: `Transcoding ${resolution.height}p: ${resolutionProgress}%`
              });
            }
          }
        });

        command
          .on('end', () => {
            completedResolutions++;
            // Final progress update for this resolution
            if (progressCallback) {
              const overallProgress = Math.round(((resolutionIndex + 1) / resolutions.length) * 100);
              progressCallback({
                resolution: `${resolution.height}p`,
                resolutionProgress: 100,
                overallProgress: overallProgress,
                message: `Completed ${resolution.height}p transcoding`
              });
            }
            resolve();
          })
          .on('error', reject)
          .run();
      });

      // Add to master playlist
      masterPlaylist.push(`#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(resolution.bitrate.replace('k', '000'))},RESOLUTION=${Math.round(resolution.height * 16/9)}x${resolution.height}`);
      masterPlaylist.push(`${resolution.height}p/${playlistName}`);

      // Upload playlist and segments with organized folder structure
      const playlistPath = path.join(outputPath, playlistName);
      const playlistContent = fs.readFileSync(playlistPath);
      
      // Create temp file for upload
      const tempPlaylistPath = path.join(tempDir, `temp_playlist_${resolution.height}.m3u8`);
      fs.writeFileSync(tempPlaylistPath, playlistContent);
      
      uploadPromises.push(
        uploadFileSmart(
          tempPlaylistPath,
          `${videoFolder}/${videoId}/${resolution.height}p/${playlistName}`
        )
      );

      // Upload all segment files
      const segmentFiles = fs.readdirSync(outputPath).filter(file => file.endsWith('.ts'));
      for (const segmentFile of segmentFiles) {
        const segmentPath = path.join(outputPath, segmentFile);
        const segmentContent = fs.readFileSync(segmentPath);
        
        // Create temp file for upload
        const tempSegmentPath = path.join(tempDir, `temp_segment_${segmentFile}`);
        fs.writeFileSync(tempSegmentPath, segmentContent);
        
        uploadPromises.push(
          uploadFileSmart(
            tempSegmentPath,
            `${videoFolder}/${videoId}/${resolution.height}p/${segmentFile}`
          )
        );
      }
    }

    // Create and upload master playlist with organized folder structure
    const masterPlaylistContent = `#EXTM3U\n#EXT-X-VERSION:3\n${masterPlaylist.join('\n')}\n`;
    const tempMasterPath = path.join(tempDir, 'temp_master.m3u8');
    fs.writeFileSync(tempMasterPath, Buffer.from(masterPlaylistContent));
    
    uploadPromises.push(
      uploadFileSmart(
        tempMasterPath,
        `${videoFolder}/${videoId}/master.m3u8`
      )
    );

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    // Clean up temp files (only if we created them - don't delete original input file)
    if (!isFilePath) {
      // Only clean up if we created temp files from buffer
      fs.rmSync(tempDir, { recursive: true, force: true });
    } else {
      // Clean up transcoding output but keep original input file
      try {
        if (fs.existsSync(outputDir)) {
          fs.rmSync(outputDir, { recursive: true, force: true });
        }
        // Clean up parent temp dir if empty
        if (fs.existsSync(tempDir)) {
          const files = fs.readdirSync(tempDir);
          if (files.length === 0) {
            fs.rmdirSync(tempDir);
          }
        }
      } catch (cleanupError) {
        console.warn('⚠️ [FFmpeg] Cleanup warning:', cleanupError.message);
      }
    }

    const videoUrl = `${videoFolder}/${videoId}/master.m3u8`; // Store relative path only

    return {
      videoUrl,
      resolutions: resolutions.map(r => r.height),
      duration: duration,
    };

  } catch (error) {
    throw new Error(`Video transcoding failed: ${error.message}`);
  }
};

module.exports = {
  transcodeToHLS,
  getVideoResolution,
}; 