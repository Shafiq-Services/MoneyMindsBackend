const B2_BUCKET = process.env.B2_BUCKET_NAME;
const B2_REGION = process.env.B2_REGION || 'us-east-005';

function getB2S3Url(filePath) {
  return `https://${B2_BUCKET}.s3.${B2_REGION}.backblazeb2.com/${filePath}`;
}

module.exports = { getB2S3Url }; 