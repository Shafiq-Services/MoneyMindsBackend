const B2 = require('backblaze-b2');
const { getB2S3Url } = require('./b2Url');

const b2 = new B2({
  applicationKeyId: process.env.B2_KEY_ID,
  applicationKey: process.env.B2_APPLICATION_KEY,
});

let authData = null;

const authorize = async () => {
  if (!authData) {
    authData = await b2.authorize();
  }
  return authData;
};

/**
 * Generate direct upload URL for client-side uploads
 * This bypasses Azure's 4GB limit by uploading directly to B2
 */
const generateDirectUploadUrl = async (fileName, contentType = 'application/octet-stream') => {
  try {
    await authorize();
    
    const bucketId = process.env.B2_BUCKET_ID;
    
    // Get upload URL
    const uploadUrl = await b2.getUploadUrl({
      bucketId: bucketId,
    });
    
    // Generate public URL for the file
    const fileUrl = getB2S3Url(fileName);
    
    return {
      uploadUrl: uploadUrl.data.uploadUrl,
      authorizationToken: uploadUrl.data.authorizationToken,
      fileName: fileName,
      fileUrl: fileUrl,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
    
  } catch (error) {
    throw new Error(`Failed to generate upload URL: ${error.message}`);
  }
};

/**
 * Generate multipart upload URLs for large files
 * This allows client-side chunked uploads
 */
const generateMultipartUploadUrls = async (fileName, contentType = 'application/octet-stream') => {
  try {
    await authorize();
    
    const bucketId = process.env.B2_BUCKET_ID;
    
    // Start multipart upload
    const multipartUpload = await b2.startLargeFile({
      bucketId: bucketId,
      fileName: fileName,
      contentType: contentType
    });
    
    // Get upload part URL
    const uploadPartUrl = await b2.getUploadPartUrl({
      fileId: multipartUpload.data.fileId
    });
    
    return {
      fileId: multipartUpload.data.fileId,
      uploadUrl: uploadPartUrl.data.uploadUrl,
      authorizationToken: uploadPartUrl.data.authorizationToken,
      fileName: fileName,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    };
    
  } catch (error) {
    throw new Error(`Failed to generate multipart upload URLs: ${error.message}`);
  }
};

/**
 * Complete multipart upload after all parts are uploaded
 */
const completeMultipartUpload = async (fileId, partSha1Array) => {
  try {
    await authorize();
    
    const finalResult = await b2.finishLargeFile({
      fileId: fileId,
      partSha1Array: partSha1Array
    });
    
    return {
      fileId: finalResult.data.fileId,
      fileName: finalResult.data.fileName,
      fileUrl: getB2S3Url(finalResult.data.fileName)
    };
    
  } catch (error) {
    throw new Error(`Failed to complete multipart upload: ${error.message}`);
  }
};

/**
 * Cancel multipart upload if something goes wrong
 */
const cancelMultipartUpload = async (fileId) => {
  try {
    await authorize();
    
    await b2.cancelLargeFile({
      fileId: fileId
    });
    
    return true;
    
  } catch (error) {
    throw new Error(`Failed to cancel multipart upload: ${error.message}`);
  }
};

module.exports = {
  generateDirectUploadUrl,
  generateMultipartUploadUrls,
  completeMultipartUpload,
  cancelMultipartUpload
}; 