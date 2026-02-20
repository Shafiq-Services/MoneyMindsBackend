const B2 = require("backblaze-b2");
const fs = require("fs");
const crypto = require("crypto");
const path = require("path");
const { getSmartUploadConfig } = require("./b2AutoTunedConfig");
// getB2S3Url no longer needed - storing relative paths only

// Initialize B2 client with official library and proper User-Agent
const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
  retry: {
    retries: 3,
    factor: 2,
    minTimeout: 1000,
    maxTimeout: 60000,
  },
  axios: {
    headers: {
      "User-Agent":
        "MoneyMinds-Backend/1.0.0+node/" +
        process.version +
        " (Backblaze-B2-Multithreaded-Upload)",
    },
  },
});

let authData = null;

/**
 * Force refresh B2 authorization token
 */
const forceRefreshAuth = async () => {
  console.log("🔄 Forcing B2 auth refresh...");
  authData = null;
  return await authorize();
};

/**
 * Authorize with B2 (cached for 24 hours)
 */
const authorize = async () => {
  if (!authData) {
    console.log("🔐 Authorizing with B2...");
    console.log(`🔑 Using Key ID: ${process.env.B2_KEY_ID ? process.env.B2_KEY_ID.substring(0, 10) + '...' : 'NOT SET'}`);
    console.log(`🗳️ Using Bucket ID: ${process.env.B2_BUCKET_ID ? process.env.B2_BUCKET_ID.substring(0, 10) + '...' : 'NOT SET'}`);
    
    try {
      authData = await b2.authorize();
      console.log("✅ B2 authorization successful");
      console.log(`🌍 Download URL: ${authData.data.downloadUrl}`);
      console.log(`🔗 API URL: ${authData.data.apiUrl}`);
    } catch (error) {
      console.error("❌ B2 authorization failed:");
      console.error(`   Error: ${error.message}`);
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Status Text: ${error.response.statusText}`);
        console.error(`   Response Data:`, JSON.stringify(error.response.data, null, 2));
      }
      throw error;
    }
  }
  return authData;
};

/**
 * Calculate SHA-1 hash of buffer
 */
const calculateSha1 = (buffer) => {
  return crypto.createHash("sha1").update(buffer).digest("hex");
};

/**
 * Calculate SHA-1 hash of a file by streaming (no full buffer in memory)
 */
const calculateSha1FromStream = (filePath) => {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
};

/**
 * Upload a single part with retry logic using official B2 API
 */
const uploadPartWithRetry = async (
  filePath,
  start,
  end,
  partNumber,
  fileId,
  config
) => {
  const partStartTime = Date.now();
  const partSize = end - start;

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      console.log(
        `📤 Uploading part ${partNumber} (attempt ${attempt}) - ${(
          partSize /
          1024 /
          1024
        ).toFixed(2)}MB (timeout: ${config.timeout / 1000}s)`
      );

      // Read the part into memory
      const fd = fs.openSync(filePath, "r");
      const buffer = Buffer.alloc(partSize);
      fs.readSync(fd, buffer, 0, partSize, start);
      fs.closeSync(fd);
      const sha1 = calculateSha1(buffer);

      // Get upload URL for this part (required by official library)
      const uploadUrlResponse = await b2.getUploadPartUrl({ fileId });
      const uploadUrl = uploadUrlResponse.data.uploadUrl;
      const authToken = uploadUrlResponse.data.authorizationToken;

      console.log(
        `📤 Starting upload for part ${partNumber} (${(
          partSize /
          1024 /
          1024
        ).toFixed(2)}MB)`
      );

      // Upload the part with proper error handling (official guidelines)
      let result;
      try {
        result = await b2.uploadPart({
          fileId: fileId,
          partNumber: partNumber,
          uploadUrl: uploadUrl,
          uploadAuthToken: authToken,
          data: buffer,
          contentLength: partSize,
        });
      } catch (uploadError) {
        // Handle 503 errors and connection failures (official recommendation)
        if (uploadError.response && uploadError.response.status === 503) {
          console.log(
            `🔄 Part ${partNumber} got 503 error, re-requesting upload URL...`
          );
          const newUploadUrlResponse = await b2.getUploadPartUrl({ fileId });
          result = await b2.uploadPart({
            fileId: fileId,
            partNumber: partNumber,
            uploadUrl: newUploadUrlResponse.data.uploadUrl,
            uploadAuthToken: newUploadUrlResponse.data.authorizationToken,
            data: buffer,
            contentLength: partSize,
          });
        } else {
          throw uploadError;
        }
      }

      const partDurationMs = Date.now() - partStartTime;
      const partSpeedMBs = partSize / (1024 * 1024) / (partDurationMs / 1000);
      console.log(
        `✅ Part ${partNumber} uploaded successfully in ${(partDurationMs / 1000).toFixed(1)}s`
      );
      console.log(`[Upload Analytics] part_upload part=${partNumber} durationMs=${partDurationMs} sizeMB=${(partSize / (1024 * 1024)).toFixed(2)} speedMBs=${partSpeedMBs.toFixed(3)}`);

      return {
        ...result.data,
        PartNumber: partNumber,
        sha1: result.data.contentSha1 || sha1,
      };
    } catch (error) {
      const attemptTime = ((Date.now() - partStartTime) / 1000).toFixed(1);
      console.error(
        `❌ Part ${partNumber} upload failed (attempt ${attempt}) after ${attemptTime}s:`,
        error.message
      );

      // Log detailed error information for debugging
      if (error.response) {
        console.error(`   Status: ${error.response.status}`);
        console.error(`   Status Text: ${error.response.statusText}`);
        console.error(`   Response Data:`, error.response.data);
        console.error(`   Headers:`, error.response.headers);
      }
      if (error.request) {
        console.error(`   Request URL: ${error.request.url}`);
        console.error(`   Request Method: ${error.request.method}`);
      }

      if (attempt === config.maxRetries) {
        throw new Error(
          `Part ${partNumber} failed after ${config.maxRetries} attempts: ${error.message}`
        );
      }

      // Wait before retry with exponential backoff (using auto-tuned config)
      const delay =
        config.retryDelayBase * Math.pow(config.retryMultiplier, attempt);
      console.log(`⏰ Waiting ${delay / 1000}s before retry...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
};

/**
 * Upload large file using official B2 API with TRUE MULTITHREADING
 */
const uploadLargeFileOfficial = async (
  filePath,
  fileName,
  progressCallback = null,
  networkInfo = null
) => {
  const startTime = Date.now();
  const fileSize = fs.statSync(filePath).size;
  const fileStats = fs.statSync(filePath);

  console.log(
    `📤 Official B2 multipart upload: ${fileName} (${(
      fileSize /
      1024 /
      1024 /
      1024
    ).toFixed(2)}GB)`
  );

  try {
    // Authorize first
    await authorize();

    // Start large file upload
    console.log("🚀 Starting large file upload...");
    const startLargeFileResponse = await b2.startLargeFile({
      bucketId: process.env.B2_BUCKET_ID,
      fileName: fileName,
    });

    const fileId = startLargeFileResponse.data.fileId;
    console.log(`✅ Large file initiated with ID: ${fileId}`);

    // Get auto-tuned configuration based on file size and network conditions
    const networkMbps = networkInfo ? networkInfo.speedMbps : 50; // Default to 50 Mbps if no network info
    const config = getSmartUploadConfig({ fileSize, networkMbps });

    // Calculate total parts based on auto-tuned part size
    const totalParts = Math.ceil(fileSize / config.partSize);
    let maxConcurrent = config.concurrency;

    // Apply network-based adjustments. On slow links use 1 stream so it gets full bandwidth (avoids two streams competing and one stalling).
    if (networkInfo) {
      maxConcurrent = Math.round(maxConcurrent * networkInfo.networkMultiplier);
      if (networkInfo.networkMultiplier < 1) {
        maxConcurrent = 1;
        console.log(
          `🌐 Slow link: using 1 concurrent upload (full bandwidth to single stream)`
        );
      } else {
        maxConcurrent = Math.max(2, maxConcurrent);
        console.log(
          `🌐 Network-adjusted concurrency: ${maxConcurrent} (multiplier: ${networkInfo.networkMultiplier})`
        );
      }
    }

    const { partSize } = config;

    console.log(`📊 Dynamic configuration:`);
    console.log(`   📦 Part size: ${(partSize / 1024 / 1024).toFixed(1)}MB`);
    console.log(`   🔄 Max concurrent: ${maxConcurrent}`);
    console.log(`   📋 Total parts: ${totalParts}`);
    console.log(
      `   📁 File size: ${(fileSize / 1024 / 1024 / 1024).toFixed(2)}GB`
    );
    if (networkInfo) {
      console.log(
        `   🌐 Network speed: ${networkInfo.speedMbps.toFixed(2)} Mbps`
      );
    }
    const uploadedParts = [];

    console.log(
      `📤 Uploading ${totalParts} parts with ${maxConcurrent} concurrent threads...`
    );
    console.log(`[Upload Analytics] large_upload_config fileSizeMB=${(fileSize / (1024 * 1024)).toFixed(2)} totalParts=${totalParts} partSizeMB=${(partSize / (1024 * 1024)).toFixed(1)} concurrency=${maxConcurrent}`);

    // Create all part upload tasks
    const partUploadTasks = [];
    for (let partNumber = 1; partNumber <= totalParts; partNumber++) {
      const start = (partNumber - 1) * partSize;
      const end = Math.min(start + partSize, fileSize);
      const thisPartSize = end - start;

      partUploadTasks.push({
        task: () =>
          uploadPartWithRetry(filePath, start, end, partNumber, fileId, config),
        partNumber,
        partSize: thisPartSize,
      });
    }

    // Process parts with controlled concurrency (TRUE MULTITHREADING)
    let completedParts = 0;
    const processBatch = async (batch) => {
      console.log(
        `🔄 Processing batch of ${batch.length} parts concurrently...`
      );
      const batchStartTime = Date.now();

      const results = await Promise.allSettled(
        batch.map(async (task, index) => {
          const taskStartTime = Date.now();
          console.log(
            `🚀 Starting part ${task.partNumber} (${(
              task.partSize /
              1024 /
              1024
            ).toFixed(2)}MB)`
          );

          try {
            const result = await task.task();
            const taskTime = ((Date.now() - taskStartTime) / 1000).toFixed(1);
            completedParts++;

            console.log(
              `✅ Part ${
                result.PartNumber
              }/${totalParts} completed in ${taskTime}s (${(
                task.partSize /
                1024 /
                1024
              ).toFixed(2)}MB)`
            );

            // Update progress
            if (progressCallback) {
              const progress = Math.round((completedParts / totalParts) * 100);
              const uploadedBytes = Math.min(
                completedParts * partSize,
                fileSize
              );
              progressCallback({
                stage: "uploading",
                progress: progress,
                message: `Uploading part ${completedParts}/${totalParts}: ${progress}%`,
                fileSize: fileSize,
                uploadedBytes: uploadedBytes,
                uploadSpeed: `${(
                  uploadedBytes /
                  ((Date.now() - startTime) / 1000) /
                  1024 /
                  1024
                ).toFixed(2)} MB/s`,
              });
            }

            return result;
          } catch (error) {
            const taskTime = ((Date.now() - taskStartTime) / 1000).toFixed(1);
            console.error(
              `❌ Part ${task.partNumber} failed after ${taskTime}s:`,
              error.message
            );
            throw error;
          }
        })
      );

      const batchDurationMs = Date.now() - batchStartTime;
      const batchPartNumbers = batch.map((t) => t.partNumber).join(",");
      const elapsedSoFarMs = Date.now() - startTime;
      const uploadedSoFarMB = (completedParts * partSize) / (1024 * 1024);
      const avgSpeedMBs = uploadedSoFarMB / (elapsedSoFarMs / 1000);
      console.log(`📊 Batch completed in ${(batchDurationMs / 1000).toFixed(1)}s`);
      console.log(`[Upload Analytics] large_upload_batch parts=[${batchPartNumbers}] batchDurationMs=${batchDurationMs} completedParts=${completedParts}/${totalParts} elapsedMs=${elapsedSoFarMs} avgSpeedMBs=${avgSpeedMBs.toFixed(3)}`);

      // Filter successful results and handle failures
      const successfulResults = [];
      const failedTasks = [];

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successfulResults.push(result.value);
          console.log(`✅ Part ${batch[index].partNumber} succeeded`);
        } else {
          failedTasks.push(batch[index]);
          console.error(
            `❌ Part ${batch[index].partNumber} failed permanently:`,
            result.reason.message
          );
        }
      });

      console.log(
        `📈 Batch results: ${successfulResults.length} successful, ${failedTasks.length} failed`
      );

      // Retry failed tasks individually
      if (failedTasks.length > 0) {
        console.log(
          `🔄 Retrying ${failedTasks.length} failed parts individually...`
        );
        for (const failedTask of failedTasks) {
          try {
            const retryResult = await failedTask.task();
            successfulResults.push(retryResult);
            console.log(`✅ Part ${retryResult.PartNumber} retry successful`);
          } catch (retryError) {
            console.error(
              `❌ Part ${failedTask.partNumber} retry failed:`,
              retryError.message
            );
            throw new Error(
              `Part ${failedTask.partNumber} failed after all retries: ${retryError.message}`
            );
          }
        }
      }

      return successfulResults;
    };

    // Process parts in batches with controlled concurrency
    for (let i = 0; i < partUploadTasks.length; i += maxConcurrent) {
      const batch = partUploadTasks.slice(i, i + maxConcurrent);
      const batchResults = await processBatch(batch);
      uploadedParts.push(...batchResults);
    }

    // Sort parts by part number to ensure correct order
    uploadedParts.sort((a, b) => a.PartNumber - b.PartNumber);

    // Finish large file upload
    console.log("✅ Finishing large file upload...");
    const partSha1Array = uploadedParts.map(
      (part) => part.contentSha1 || part.sha1
    );

    console.log(`📋 Finishing with ${uploadedParts.length} parts:`);
    uploadedParts.forEach((part, index) => {
      console.log(
        `   Part ${index + 1}: ${part.PartNumber}, SHA1: ${
          part.contentSha1 || part.sha1
        }`
      );
    });

    let finishResult;
    try {
      finishResult = await b2.finishLargeFile({
        fileId: fileId,
        partSha1Array: partSha1Array,
      });

      console.log("✅ finishLargeFile call successful");
      console.log(`📋 Finish result:`, finishResult.data);
    } catch (finishError) {
      console.error("❌ finishLargeFile failed:");
      console.error(`   Error message: ${finishError.message}`);
      if (finishError.response) {
        console.error(`   Status: ${finishError.response.status}`);
        console.error(`   Status Text: ${finishError.response.statusText}`);
        console.error(`   Response Data:`, finishError.response.data);
      }
      throw finishError;
    }

    const largeUploadTotalMs = Date.now() - startTime;
    const largeUploadSpeedMBs = (fileSize / (1024 * 1024)) / (largeUploadTotalMs / 1000);
    console.log(
      `✅ Large file upload completed in ${(largeUploadTotalMs / 1000).toFixed(1)}s: ${finishResult.data.fileName}`
    );
    console.log(
      `🚀 Average speed: ${largeUploadSpeedMBs.toFixed(2)} MB/s`
    );
    console.log(`[Upload Analytics] large_upload_done durationMs=${largeUploadTotalMs} fileSizeMB=${(fileSize / (1024 * 1024)).toFixed(2)} avgSpeedMBs=${largeUploadSpeedMBs.toFixed(3)} totalParts=${uploadedParts.length}`);

    if (progressCallback) {
      progressCallback({
        stage: "complete",
        progress: 100,
        message: "Upload complete!",
        fileSize: fileSize,
        uploadedBytes: fileSize,
        uploadSpeed: `${(
          fileSize /
          ((Date.now() - startTime) / 1000) /
          1024 /
          1024
        ).toFixed(2)} MB/s`,
      });
    }

    return {
      fileId: finishResult.data.fileId,
      fileName: finishResult.data.fileName,
      fileUrl: finishResult.data.fileName, // Store relative path only
      fileSize: fileSize,
      uploadTime: Math.round((Date.now() - startTime) / 1000),
    };
  } catch (error) {
    console.error("❌ Large file upload failed:", error.message);

    // Clean up large file on failure
    if (error.fileId) {
      try {
        await b2.cancelLargeFile({ fileId: error.fileId });
        console.log("🧹 Cleaned up failed large file upload");
      } catch (cleanupError) {
        console.warn(
          "⚠️ Could not clean up large file upload:",
          cleanupError.message
        );
      }
    }

    throw new Error(`B2 large file upload failed: ${error.message}`);
  }
};

/**
 * Upload small file using official B2 API
 */
const uploadSmallFileOfficial = async (
  filePath,
  fileName,
  progressCallback = null
) => {
  const startTime = Date.now();

  // Ensure file exists and is readable
  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileSize = fs.statSync(filePath).size;

  console.log(
    `📤 Official B2 direct upload: ${fileName} (${(
      fileSize /
      1024 /
      1024
    ).toFixed(2)}MB)`
  );

  // Check for empty or very small files
  if (fileSize === 0) {
    console.warn("⚠️ Empty file detected, skipping upload");
    return {
      fileId: "empty-file",
      fileName: fileName,
      fileUrl: fileName, // Store relative path only
      fileSize: 0,
      uploadTime: 0,
    };
  }

  try {
    await authorize();

    const uploadUrlResponse = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID,
    });

    const uploadUrl = uploadUrlResponse.data.uploadUrl;
    const authToken = uploadUrlResponse.data.authorizationToken;

    // Compute SHA1 by streaming (no full buffer in memory)
    const sha1 = await calculateSha1FromStream(filePath);

    const getContentType = (name) => {
      const ext = path.extname(name).toLowerCase();
      const contentTypes = {
        ".m3u8": "application/vnd.apple.mpegurl",
        ".ts": "video/mp2t",
        ".mp4": "video/mp4",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".gif": "image/gif",
        ".webp": "image/webp",
        ".pdf": "application/pdf",
        ".txt": "text/plain",
        ".json": "application/json",
        ".xml": "application/xml",
        ".html": "text/html",
        ".css": "text/css",
        ".js": "application/javascript",
      };
      return contentTypes[ext] || "application/octet-stream";
    };

    const contentType = getContentType(fileName);

    // Upload using stream (second read; no full buffer)
    const readStream = fs.createReadStream(filePath);
    const result = await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authToken,
      fileName,
      data: readStream,
      hash: sha1,
      contentLength: fileSize,
      contentType,
      onUploadProgress: (event) => {
        if (progressCallback) {
          const progress = Math.round((event.loaded / fileSize) * 100);
          progressCallback({
            stage: "uploading",
            progress,
            message: `Uploading: ${progress}%`,
            fileSize,
            uploadedBytes: event.loaded,
            uploadSpeed: `${(
              event.loaded /
              ((Date.now() - startTime) / 1000) /
              1024 /
              1024
            ).toFixed(2)} MB/s`,
          });
        }
      },
    });

    const smallUploadDurationMs = Date.now() - startTime;
    const smallUploadSpeedMBs = (fileSize / (1024 * 1024)) / (smallUploadDurationMs / 1000);
    console.log(
      `✅ Direct upload completed in ${(smallUploadDurationMs / 1000).toFixed(1)}s: ${result.data.fileName}`
    );
    console.log(`[Upload Analytics] small_upload_done fileName=${fileName} durationMs=${smallUploadDurationMs} sizeMB=${(fileSize / (1024 * 1024)).toFixed(3)} speedMBs=${smallUploadSpeedMBs.toFixed(3)}`);

    if (result.data.contentLength !== fileSize) {
      console.warn(
        `⚠️ Upload size mismatch: uploaded ${result.data.contentLength} bytes, expected ${fileSize} bytes`
      );
    }

    if (result.data.contentSha1 && result.data.contentSha1 !== sha1) {
      console.warn(
        `⚠️ SHA1 mismatch: uploaded ${result.data.contentSha1}, expected ${sha1}`
      );
    }

    if (progressCallback) {
      progressCallback({
        stage: "complete",
        progress: 100,
        message: "Upload complete!",
        fileSize,
        uploadedBytes: fileSize,
        uploadSpeed: `${(
          fileSize /
          ((Date.now() - startTime) / 1000) /
          1024 /
          1024
        ).toFixed(2)} MB/s`,
      });
    }

    return {
      fileId: result.data.fileId,
      fileName: result.data.fileName,
      fileUrl: result.data.fileName,
      fileSize,
      uploadTime: Math.round((Date.now() - startTime) / 1000),
    };
  } catch (error) {
    console.error("❌ Direct upload failed:", error.message);

    // Enhanced error logging for debugging
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Status Text: ${error.response.statusText}`);
      console.error(`   Response Data:`, error.response.data);
      console.error(`   Headers:`, error.response.headers);
    }
    if (error.request) {
      console.error(`   Request URL: ${error.request.url}`);
      console.error(`   Request Method: ${error.request.method}`);
    }

    throw new Error(`B2 direct upload failed: ${error.message}`);
  }
};

/** Cache for real B2 upload speed test (avoid testing on every small file) */
const NETWORK_SPEED_CACHE_MS = 60000; // 1 minute
let networkSpeedCache = null;
let networkSpeedCacheTime = 0;

const DEFAULT_NETWORK_INFO = { speedMbps: 50, networkMultiplier: 1 };

/**
 * Test upload speed by performing a real 1MB upload to B2. Result is cached for 1 minute.
 * On failure (B2 down, auth error, etc.) returns safe defaults without throwing.
 */
const testNetworkSpeed = async () => {
  if (networkSpeedCache && Date.now() - networkSpeedCacheTime < NETWORK_SPEED_CACHE_MS) {
    return networkSpeedCache;
  }

  try {
    await authorize();
    const uploadUrlResponse = await b2.getUploadUrl({
      bucketId: process.env.B2_BUCKET_ID,
    });
    const uploadUrl = uploadUrlResponse.data.uploadUrl;
    const authToken = uploadUrlResponse.data.authorizationToken;

    const testSize = 1024 * 1024; // 1MB
    const testBuffer = Buffer.alloc(testSize);
    const sha1 = calculateSha1(testBuffer);
    const testFileName = "__speedtest__/probe";

    const startTime = Date.now();
    await b2.uploadFile({
      uploadUrl,
      uploadAuthToken: authToken,
      fileName: testFileName,
      data: testBuffer,
      hash: sha1,
      contentLength: testSize,
      contentType: "application/octet-stream",
    });
    const elapsedMs = Date.now() - startTime;
    const elapsedSec = Math.max(elapsedMs / 1000, 0.001);
    const speedMbps = (testSize * 8) / (elapsedSec * 1e6);

    let networkMultiplier = 1;
    if (speedMbps < 10) {
      networkMultiplier = 0.5;
      console.log("🐌 Slow connection detected, reducing concurrency");
    } else if (speedMbps > 100) {
      networkMultiplier = 1.5;
      console.log("🚀 Fast connection detected, increasing concurrency");
    }

    console.log(`📊 Network speed (B2 upload): ${speedMbps.toFixed(2)} Mbps`);
    console.log(`[Upload Analytics] speed_test durationMs=${elapsedMs} sizeMB=1 speedMbps=${speedMbps.toFixed(2)} multiplier=${networkMultiplier}`);
    const result = { speedMbps, networkMultiplier };
    networkSpeedCache = result;
    networkSpeedCacheTime = Date.now();
    return result;
  } catch (error) {
    console.log("⚠️ Could not test network speed, using default settings:", error.message);
    return DEFAULT_NETWORK_INFO;
  }
};

/**
 * Smart upload that chooses the best method based on file size and network conditions.
 * @param {string} filePath - Local file path
 * @param {string} fileName - B2 destination path
 * @param {Function|null} progressCallback - Optional progress callback
 * @param {{ speedMbps: number, networkMultiplier: number }|null} cachedNetworkInfo - If provided, skip speed test (used by HLS batch uploads)
 */
const uploadFileSmart = async (filePath, fileName, progressCallback = null, cachedNetworkInfo = null) => {
  const fileSize = fs.statSync(filePath).size;
  const LARGE_FILE_THRESHOLD = 50 * 1024 * 1024; // 50MB threshold for multipart upload (minimum 2 parts of 6MB each)

  console.log(
    `📤 Smart upload starting for: ${fileName} (${(
      fileSize /
      1024 /
      1024
    ).toFixed(2)}MB)`
  );

  const networkInfo = cachedNetworkInfo != null ? cachedNetworkInfo : await testNetworkSpeed();

  if (fileSize >= LARGE_FILE_THRESHOLD) {
    console.log(
      "📋 Large file detected (≥50MB), using adaptive multithreaded upload"
    );
    return await uploadLargeFileOfficial(
      filePath,
      fileName,
      progressCallback,
      networkInfo
    );
  } else {
    console.log("📋 Small file detected (<50MB), using direct upload");
    return await uploadSmallFileOfficial(filePath, fileName, progressCallback);
  }
};

/**
 * Test B2 connection using official library
 */
const testB2Connection = async () => {
  try {
    console.log("🔍 Testing B2 connection with official library...");
    await authorize();

    // Test bucket access
    const bucketResponse = await b2.getBucket({
      bucketId: process.env.B2_BUCKET_ID,
    });

    console.log("✅ B2 connection successful");
    console.log(`📋 Bucket: ${bucketResponse.data.bucketName}`);
    return true;
  } catch (error) {
    console.error("❌ B2 connection failed:", error.message);
    return false;
  }
};

module.exports = {
  uploadLargeFileOfficial,
  uploadSmallFileOfficial,
  uploadFileSmart,
  testNetworkSpeed,
  testB2Connection,
};
