const { getB2S3Url } = require('./b2Url');

/**
 * Convert a relative path or existing full URL to Azure CDN format
 * @param {string} url - The URL to convert (can be relative path or full URL)
 * @returns {string} - Full Azure CDN URL or original URL if external
 */
function convertToFullUrl(url) {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return url; // Return as-is if empty or invalid
  }

  // If it's already an external URL (starts with http/https), return as-is
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // If it's a relative path, convert to Azure CDN URL
  return getB2S3Url(url);
}

/**
 * Convert URL fields in an object to full URLs
 * @param {Object} obj - Object containing URL fields
 * @param {Array} urlFields - Array of field names that contain URLs
 * @returns {Object} - Object with converted URLs
 */
function convertUrlFields(obj, urlFields) {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const converted = { ...obj };
  
  urlFields.forEach(field => {
    if (converted[field]) {
      converted[field] = convertToFullUrl(converted[field]);
    }
  });

  return converted;
}

module.exports = {
  convertToFullUrl,
  convertUrlFields
};
