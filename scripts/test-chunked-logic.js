const fs = require('fs');
const path = require('path');

// Mock B2 functions for testing
const mockB2Instance = {
  authorize: async () => {
    console.log('🔐 Mock B2 authorization');
    return Promise.resolve();
  },
  startLargeFile: async ({ bucketId, fileName, contentType }) => {
    console.log(`📤 Mock startLargeFile: ${fileName}`);
    return Promise.resolve({
      data: {
        fileId: `mock-file-id-${Date.now()}`,
        fileName: fileName
      }
    });
  },
  uploadPart: async ({ fileId, partNumber, data }) => {
    console.log(`📤 Mock uploadPart: fileId=${fileId}, part=${partNumber}, size=${data.length}`);
    // Simulate upload delay
    await new Promise(resolve => setTimeout(resolve, 100));
    return Promise.resolve({
      data: {
        fileId: `mock-part-${partNumber}`,
        partNumber: partNumber
      }
    });
  },
  finishLargeFile: async ({ fileId, partSha1Array }) => {
    console.log(`✅ Mock finishLargeFile: fileId=${fileId}, parts=${partSha1Array.length}`);
    return Promise.resolve({
      data: {
        fileId: fileId,
        fileName: 'mock-completed-file'
      }
    });
  }
};

// Mock chunked upload function for testing
const uploadFileInChunks = async (filePath, fileName, chunkSize = 5 * 1024 * 1024, progressCallback = null) => {
  try {
    await mockB2Instance.authorize();
    
    const bucketId = 'mock-bucket-id';
    const fileSize = fs.statSync(filePath).size;
    const totalChunks = Math.ceil(fileSize / chunkSize);
    
    console.log(`📤 Starting chunked upload: ${fileName} (${fileSize} bytes, ${totalChunks} chunks)`);
    
    // Start multipart upload
    const multipartUpload = await mockB2Instance.startLargeFile({
      bucketId: bucketId,
      fileName: fileName,
      contentType: 'application/octet-stream'
    });
    
    console.log(`✅ Multipart upload started: ${multipartUpload.data.fileId}`);
    
    const uploadedParts = [];
    let completedChunks = 0;
    let startTime = Date.now();
    
    // Progress tracking interval (every 1 second)
    const progressInterval = setInterval(() => {
      if (progressCallback && completedChunks > 0) {
        const progress = Math.round((completedChunks / totalChunks) * 100);
        const uploadedBytes = Math.min(completedChunks * chunkSize, fileSize);
        const elapsedTime = (Date.now() - startTime) / 1000;
        const uploadSpeed = elapsedTime > 0 ? (uploadedBytes / elapsedTime) : 0;
        const remainingBytes = fileSize - uploadedBytes;
        const timeRemaining = uploadSpeed > 0 ? Math.ceil(remainingBytes / uploadSpeed) : 0;
        
        progressCallback({
          stage: 'uploading',
          progress: progress,
          completedChunks: completedChunks,
          totalChunks: totalChunks,
          currentChunk: completedChunks,
          message: `Uploading chunk ${completedChunks}/${totalChunks} (${progress}%)`,
          fileSize: fileSize,
          uploadedBytes: uploadedBytes,
          uploadSpeed: `${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
          timeRemaining: `${timeRemaining}s`
        });
      }
    }, 1000);
    
    // Upload chunks sequentially
    const uploadChunk = async (chunkIndex) => {
      const start = chunkIndex * chunkSize;
      const end = Math.min(start + chunkSize, fileSize);
      const chunkSizeActual = end - start;
      
      // Read chunk from file as Buffer
      const chunkBuffer = fs.readFileSync(filePath, { 
        start, 
        end: end - 1
      });
      
      try {
        console.log(`📤 Uploading chunk ${chunkIndex + 1}/${totalChunks} (${chunkSizeActual} bytes)`);
        
        const uploadResult = await mockB2Instance.uploadPart({
          fileId: multipartUpload.data.fileId,
          partNumber: chunkIndex + 1,
          data: chunkBuffer
        });
        
        uploadedParts.push({
          partNumber: chunkIndex + 1,
          fileId: uploadResult.data.fileId
        });
        
        completedChunks++;
        
        console.log(`✅ Chunk ${chunkIndex + 1}/${totalChunks} uploaded successfully`);
        
        // Immediate progress update
        if (progressCallback) {
          const progress = Math.round((completedChunks / totalChunks) * 100);
          const uploadedBytes = Math.min(completedChunks * chunkSize, fileSize);
          const elapsedTime = (Date.now() - startTime) / 1000;
          const uploadSpeed = elapsedTime > 0 ? (uploadedBytes / elapsedTime) : 0;
          const remainingBytes = fileSize - uploadedBytes;
          const timeRemaining = uploadSpeed > 0 ? Math.ceil(remainingBytes / uploadSpeed) : 0;
          
          progressCallback({
            stage: 'uploading',
            progress: progress,
            completedChunks: completedChunks,
            totalChunks: totalChunks,
            currentChunk: chunkIndex + 1,
            message: `Uploaded chunk ${chunkIndex + 1}/${totalChunks} (${progress}%)`,
            fileSize: fileSize,
            uploadedBytes: uploadedBytes,
            uploadSpeed: `${(uploadSpeed / 1024 / 1024).toFixed(2)} MB/s`,
            timeRemaining: `${timeRemaining}s`
          });
        }
        
      } catch (error) {
        console.error(`❌ Failed to upload chunk ${chunkIndex + 1}:`, error.message);
        clearInterval(progressInterval);
        throw new Error(`Chunk ${chunkIndex + 1} upload failed: ${error.message}`);
      }
    };
    
    // Upload chunks sequentially
    for (let i = 0; i < totalChunks; i++) {
      await uploadChunk(i);
    }
    
    clearInterval(progressInterval);
    
    console.log(`✅ All chunks uploaded, completing multipart upload...`);
    
    // Complete multipart upload
    const finalResult = await mockB2Instance.finishLargeFile({
      fileId: multipartUpload.data.fileId,
      partSha1Array: uploadedParts.map(part => part.fileId)
    });
    
    console.log(`✅ Multipart upload completed: ${finalResult.data.fileId}`);
    
    // Mock file URL
    const fileUrl = `https://mock-b2.example.com/${fileName}`;
    
    // Final progress update
    if (progressCallback) {
      progressCallback({
        stage: 'uploading',
        progress: 100,
        completedChunks: totalChunks,
        totalChunks: totalChunks,
        currentChunk: totalChunks,
        message: 'Upload complete!',
        fileSize: fileSize,
        uploadedBytes: fileSize,
        uploadSpeed: 'complete',
        timeRemaining: '0s'
      });
    }
    
    return {
      fileId: finalResult.data.fileId,
      fileName: finalResult.data.fileName,
      fileUrl: fileUrl,
      fileSize: fileSize,
      totalChunks: totalChunks
    };
    
  } catch (error) {
    console.error('❌ Chunked upload failed:', error.message);
    throw new Error(`Chunked upload failed: ${error.message}`);
  }
};

// Test configuration
const TEST_FILE_SIZE = 20 * 1024 * 1024; // 20MB test file
const TEST_FILE_PATH = path.join(__dirname, '../temp/test-chunked-logic.bin');
const TEST_FILE_NAME = `test-chunked-logic-${Date.now()}.bin`;

// Create test file if it doesn't exist
function createTestFile() {
  if (!fs.existsSync(TEST_FILE_PATH)) {
    console.log(`📁 Creating test file: ${TEST_FILE_PATH} (${TEST_FILE_SIZE} bytes)`);
    
    // Create temp directory if it doesn't exist
    const tempDir = path.dirname(TEST_FILE_PATH);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Create a test file with random data
    const buffer = Buffer.alloc(TEST_FILE_SIZE);
    for (let i = 0; i < buffer.length; i++) {
      buffer[i] = Math.floor(Math.random() * 256);
    }
    
    fs.writeFileSync(TEST_FILE_PATH, buffer);
    console.log(`✅ Test file created successfully`);
  } else {
    console.log(`📁 Using existing test file: ${TEST_FILE_PATH}`);
  }
}

// Progress callback function
function progressCallback(progress) {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}] 📊 Progress: ${progress.progress}% | Chunk: ${progress.completedChunks}/${progress.totalChunks} | Speed: ${progress.uploadSpeed} | ETA: ${progress.timeRemaining} | ${progress.message}`);
}

// Main test function
async function testChunkedLogic() {
  try {
    console.log('🚀 Starting chunked upload logic test...');
    
    // Create test file
    createTestFile();
    
    // Verify file exists and get size
    const stats = fs.statSync(TEST_FILE_PATH);
    console.log(`📊 Test file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Start upload with progress tracking
    console.log(`📤 Starting upload: ${TEST_FILE_NAME}`);
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    const result = await uploadFileInChunks(
      TEST_FILE_PATH, 
      TEST_FILE_NAME, 
      5 * 1024 * 1024, // 5MB chunks
      progressCallback
    );
    
    const endTime = Date.now();
    const totalTime = (endTime - startTime) / 1000;
    
    console.log('='.repeat(80));
    console.log('✅ Upload completed successfully!');
    console.log(`📊 Results:`);
    console.log(`   - File ID: ${result.fileId}`);
    console.log(`   - File Name: ${result.fileName}`);
    console.log(`   - File URL: ${result.fileUrl}`);
    console.log(`   - File Size: ${(result.fileSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`   - Total Chunks: ${result.totalChunks}`);
    console.log(`   - Total Time: ${totalTime.toFixed(2)} seconds`);
    console.log(`   - Average Speed: ${((result.fileSize / totalTime) / 1024 / 1024).toFixed(2)} MB/s`);
    
    // Clean up test file
    console.log(`🧹 Cleaning up test file...`);
    if (fs.existsSync(TEST_FILE_PATH)) {
      fs.unlinkSync(TEST_FILE_PATH);
      console.log(`✅ Test file cleaned up`);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testChunkedLogic();
}

module.exports = { testChunkedLogic }; 