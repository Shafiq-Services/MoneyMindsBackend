const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const { uploadFile } = require('./backblazeB2');

const getVideoResolution = (videoBuffer) => {
  return new Promise((resolve, reject) => {
    const tempPath = path.join(__dirname, '../temp', `temp_${Date.now()}.mp4`);
    
    // Ensure temp directory exists
    const tempDir = path.dirname(tempPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(tempPath, videoBuffer);

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

const transcodeToHLS = async (videoBuffer, videoId, progressTracker = null) => {
  try {
    if (progressTracker) {
      progressTracker.startTranscoding();
    }

    const { width, height, duration } = await getVideoResolution(videoBuffer);
    const resolutions = generateHLSResolutions(height);
    
    const tempDir = path.join(__dirname, '../temp', videoId);
    const outputDir = path.join(tempDir, 'hls');
    
    // Create directories
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    // Save input video temporarily
    const inputPath = path.join(tempDir, 'input.mp4');
    fs.writeFileSync(inputPath, videoBuffer);

    const masterPlaylist = [];
    const uploadPromises = [];
    let completedResolutions = 0;

    // Generate HLS for each resolution
    for (const resolution of resolutions) {
      const outputPath = path.join(outputDir, `${resolution.height}p`);
      const playlistName = `${resolution.height}p.m3u8`;
      
      if (!fs.existsSync(outputPath)) {
        fs.mkdirSync(outputPath, { recursive: true });
      }

      await new Promise((resolve, reject) => {
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
            '-hls_segment_filename', path.join(outputPath, 'segment_%03d.ts'),
            '-f hls'
          ])
          .output(path.join(outputPath, playlistName));

        // Add progress tracking for this resolution
        if (progressTracker && duration) {
          command.on('progress', (progress) => {
            // Calculate progress for this resolution
            const resolutionProgress = progress.percent || 0;
            const baseProgress = (completedResolutions / resolutions.length) * 100;
            const currentResolutionProgress = (resolutionProgress / resolutions.length);
            const totalTranscodingProgress = baseProgress + currentResolutionProgress;
            
            progressTracker.updateTranscodingProgress(totalTranscodingProgress);
          });
        }

        command
          .on('end', () => {
            completedResolutions++;
            resolve();
          })
          .on('error', reject)
          .run();
      });

      // Add to master playlist
      masterPlaylist.push(`#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(resolution.bitrate.replace('k', '000'))},RESOLUTION=${Math.round(resolution.height * 16/9)}x${resolution.height}`);
      masterPlaylist.push(`${resolution.height}p/${playlistName}`);

      // Upload playlist and segments
      const playlistPath = path.join(outputPath, playlistName);
      const playlistContent = fs.readFileSync(playlistPath);
      
      uploadPromises.push(
        uploadFile(
          `videos/${videoId}/${resolution.height}p/${playlistName}`,
          playlistContent
        )
      );

      // Upload all segment files
      const segmentFiles = fs.readdirSync(outputPath).filter(file => file.endsWith('.ts'));
      for (const segmentFile of segmentFiles) {
        const segmentPath = path.join(outputPath, segmentFile);
        const segmentContent = fs.readFileSync(segmentPath);
        
        uploadPromises.push(
          uploadFile(
            `videos/${videoId}/${resolution.height}p/${segmentFile}`,
            segmentContent
          )
        );
      }
    }

    // Create and upload master playlist
    const masterPlaylistContent = `#EXTM3U\n#EXT-X-VERSION:3\n${masterPlaylist.join('\n')}\n`;
    uploadPromises.push(
      uploadFile(
        `videos/${videoId}/master.m3u8`,
        Buffer.from(masterPlaylistContent)
      )
    );

    // Wait for all uploads to complete
    await Promise.all(uploadPromises);

    // Clean up temp files
    fs.rmSync(tempDir, { recursive: true, force: true });

    const videoUrl = `https://f000.backblazeb2.com/file/${process.env.B2_BUCKET_NAME}/videos/${videoId}/master.m3u8`;

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