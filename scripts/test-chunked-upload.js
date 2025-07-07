const fs = require('fs');
const path = require('path');
const { uploadFileWithRetry } = require('../utils/chunkedUpload');

// Test configuration
const TEST_FILE_SIZE = 50 * 1024 * 1024; // 50MB test file
const TEST_FILE_PATH = path.join(__dirname, '../temp/test-chunked-upload.bin');
const TEST_FILE_NAME = `test-chunked-upload-${Date.now()}.bin`;

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
async function testChunkedUpload() {
  try {
    console.log('🚀 Starting chunked upload test...');
    
    // Create test file
    createTestFile();
    
    // Verify file exists and get size
    const stats = fs.statSync(TEST_FILE_PATH);
    console.log(`📊 Test file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Start upload with progress tracking
    console.log(`📤 Starting upload: ${TEST_FILE_NAME}`);
    console.log('='.repeat(80));
    
    const startTime = Date.now();
    
    const result = await uploadFileWithRetry(
      TEST_FILE_PATH, 
      TEST_FILE_NAME, 
      3, // max retries
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
  testChunkedUpload();
}

module.exports = { testChunkedUpload }; 