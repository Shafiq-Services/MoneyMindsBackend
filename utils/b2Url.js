const B2_BUCKET = process.env.B2_BUCKET_NAME;
const B2_REGION = process.env.B2_REGION || 'us-east-005';
const AZURE_CDN_URL = process.env.AZURE_CDN_URL;
function getB2S3Url(filePath) {
  return `https://${B2_BUCKET}.s3.${B2_REGION}.backblazeb2.com/${filePath}`;
}

// function getB2S3Url(filePath) {
//   return `${AZURE_CDN_URL}/file/${B2_BUCKET}/${filePath}`;
// }
module.exports = { getB2S3Url }; 