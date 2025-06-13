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

const uploadFile = async (fileName, fileBuffer, progressCallback = null) => {
  try {
    await authorize();
    
    const bucketId = process.env.B2_BUCKET_ID;
    
    const uploadUrl = await b2.getUploadUrl({
      bucketId: bucketId,
    });

    // Track upload progress if callback provided
    let uploadOptions = {
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      fileName: fileName,
      data: fileBuffer,
    };

    // Add progress tracking if callback is provided
    if (progressCallback) {
      uploadOptions.onUploadProgress = (progressEvent) => {
        if (progressEvent.total > 0) {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          progressCallback({ percent, loaded: progressEvent.loaded, total: progressEvent.total });
        }
      };
    }

    const response = await b2.uploadFile(uploadOptions);

    // Generate public S3 URL
    const fileUrl = getB2S3Url(fileName);
    
    return {
      fileId: response.data.fileId,
      fileName: response.data.fileName,
      fileUrl: fileUrl,
    };
  } catch (error) {
    throw new Error(`Failed to upload file to B2: ${error.message}`);
  }
};

const deleteFile = async (fileName, fileId) => {
  try {
    await authorize();
    
    await b2.deleteFileVersion({
      fileId: fileId,
      fileName: fileName,
    });
    
    return true;
  } catch (error) {
    throw new Error(`Failed to delete file from B2: ${error.message}`);
  }
};

module.exports = {
  uploadFile,
  deleteFile,
}; 