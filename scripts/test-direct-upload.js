const fs = require('fs');
const path = require('path');
const { generateDirectUploadUrl } = require('../utils/b2DirectUpload');
const axios = require('axios');

// Test configuration
const TEST_FILE_SIZE = 10 * 1024 * 1024; // 10MB test file
const TEST_FILE_PATH = path.join(__dirname, '../temp/test-direct-upload.bin');
const TEST_FILE_NAME = `test-direct-upload-${Date.now()}.bin`;

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

// Test direct upload
async function testDirectUpload() {
  try {
    console.log('🚀 Testing direct B2 upload...');
    
    // Create test file
    createTestFile();
    
    // Get file stats
    const stats = fs.statSync(TEST_FILE_PATH);
    console.log(`📊 Test file size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    
    // Generate upload URL
    console.log('🔐 Generating B2 upload URL...');
    const uploadData = await generateDirectUploadUrl(TEST_FILE_NAME);
    
    console.log(`📤 Upload URL: ${uploadData.uploadUrl}`);
    console.log(`📤 Authorization token: ${uploadData.authorizationToken.substring(0, 20)}...`);
    console.log(`📤 File name: ${uploadData.fileName}`);
    
    // Upload file
    console.log('📤 Starting direct upload...');
    const fileStream = fs.createReadStream(TEST_FILE_PATH);
    
    const response = await axios.post(uploadData.uploadUrl, fileStream, {
      headers: {
        'Authorization': uploadData.authorizationToken,
        'Content-Type': 'application/octet-stream',
        'Content-Length': stats.size,
        'X-Bz-File-Name': uploadData.fileName,
        'X-Bz-Content-Sha1': 'do_not_verify',
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 7200000, // 2 hours
    });
    
    console.log('✅ Direct upload successful!');
    console.log(`📊 Response:`, {
      fileId: response.data.fileId,
      fileName: response.data.fileName,
      fileUrl: uploadData.fileUrl
    });
    
    // Clean up test file
    console.log(`🧹 Cleaning up test file...`);
    if (fs.existsSync(TEST_FILE_PATH)) {
      fs.unlinkSync(TEST_FILE_PATH);
      console.log(`✅ Test file cleaned up`);
    }
    
  } catch (error) {
    console.error('❌ Direct upload test failed:', error.message);
    
    if (error.response) {
      console.error('❌ Response details:', {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      });
    }
    
    // Clean up test file on error
    if (fs.existsSync(TEST_FILE_PATH)) {
      fs.unlinkSync(TEST_FILE_PATH);
    }
    
    process.exit(1);
  }
}

// Run test
if (require.main === module) {
  testDirectUpload();
}

module.exports = { testDirectUpload }; 