const B2 = require('backblaze-b2');

// Test B2 configuration
async function testB2Config() {
  try {
    console.log('🔐 Testing B2 configuration...');
    
    // Check environment variables
    console.log('📋 Environment variables:');
    console.log(`   B2_KEY_ID: ${process.env.B2_KEY_ID ? 'Set' : 'Not set'}`);
    console.log(`   B2_APPLICATION_KEY: ${process.env.B2_APPLICATION_KEY ? 'Set' : 'Not set'}`);
    console.log(`   B2_BUCKET_ID: ${process.env.B2_BUCKET_ID ? 'Set' : 'Not set'}`);
    console.log(`   B2_BUCKET_NAME: ${process.env.B2_BUCKET_NAME ? 'Set' : 'Not set'}`);
    console.log(`   B2_REGION: ${process.env.B2_REGION || 'us-east-005'}`);
    
    if (!process.env.B2_KEY_ID || !process.env.B2_APPLICATION_KEY) {
      console.error('❌ B2 credentials not configured!');
      console.log('📝 Please set the following environment variables:');
      console.log('   B2_KEY_ID=your_key_id');
      console.log('   B2_APPLICATION_KEY=your_application_key');
      console.log('   B2_BUCKET_ID=your_bucket_id');
      console.log('   B2_BUCKET_NAME=your_bucket_name');
      return;
    }
    
    // Initialize B2
    const b2 = new B2({
      applicationKeyId: process.env.B2_KEY_ID,
      applicationKey: process.env.B2_APPLICATION_KEY,
    });
    
    console.log('🔐 Attempting to authorize with B2...');
    
    // Test authorization
    const authData = await b2.authorize();
    console.log('✅ B2 authorization successful!');
    console.log(`   Account ID: ${authData.data.accountId}`);
    console.log(`   API URL: ${authData.data.apiUrl}`);
    console.log(`   Download URL: ${authData.data.downloadUrl}`);
    
    // Test bucket access
    console.log('📦 Testing bucket access...');
    const bucketId = process.env.B2_BUCKET_ID;
    
    if (!bucketId) {
      console.error('❌ B2_BUCKET_ID not set!');
      return;
    }
    
    // List buckets to verify access
    const buckets = await b2.listBuckets();
    console.log('✅ Bucket access successful!');
    console.log(`   Available buckets: ${buckets.data.buckets.length}`);
    
    // Find our target bucket
    const targetBucket = buckets.data.buckets.find(b => b.bucketId === bucketId);
    if (targetBucket) {
      console.log(`✅ Target bucket found: ${targetBucket.bucketName}`);
      console.log(`   Bucket ID: ${targetBucket.bucketId}`);
      console.log(`   Bucket Type: ${targetBucket.bucketType}`);
    } else {
      console.error(`❌ Target bucket with ID ${bucketId} not found!`);
      console.log('Available bucket IDs:');
      buckets.data.buckets.forEach(b => {
        console.log(`   - ${b.bucketId} (${b.bucketName})`);
      });
    }
    
    // Test multipart upload capabilities
    console.log('🧪 Testing multipart upload capabilities...');
    
    try {
      // Try to start a large file upload (this will fail but we can see the error)
      const testFileName = `test-multipart-${Date.now()}.txt`;
      
      const largeFile = await b2.startLargeFile({
        bucketId: bucketId,
        fileName: testFileName,
        contentType: 'text/plain'
      });
      
      console.log('✅ Multipart upload test successful!');
      console.log(`   Test file ID: ${largeFile.data.fileId}`);
      
      // Clean up the test file
      try {
        await b2.cancelLargeFile({
          fileId: largeFile.data.fileId
        });
        console.log('🧹 Test file cleaned up');
      } catch (cleanupError) {
        console.log('⚠️ Could not clean up test file (this is normal)');
      }
      
    } catch (multipartError) {
      console.error('❌ Multipart upload test failed:', multipartError.message);
      
      if (multipartError.message.includes('Invalid accountId')) {
        console.log('💡 This might be a credentials issue. Check your B2 account settings.');
      } else if (multipartError.message.includes('bucket')) {
        console.log('💡 This might be a bucket permissions issue.');
      }
    }
    
    console.log('✅ B2 configuration test completed!');
    
  } catch (error) {
    console.error('❌ B2 configuration test failed:', error.message);
    
    if (error.message.includes('Invalid accountId')) {
      console.log('💡 Possible solutions:');
      console.log('   1. Check your B2_KEY_ID and B2_APPLICATION_KEY');
      console.log('   2. Verify your B2 account is active');
      console.log('   3. Ensure your application key has the necessary permissions');
    }
  }
}

// Run test
if (require.main === module) {
  testB2Config();
}

module.exports = { testB2Config }; 