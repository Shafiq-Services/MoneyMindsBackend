// utils/b2AutoTunedConfig.js

const MB = 1024 * 1024;
const GB = 1024 * MB;

const getDynamicPartSize = (fileSize) => {
  if (fileSize < 200 * MB) return 6 * MB;  // Backblaze minimum: >5MB
  if (fileSize < 1 * GB) return 6 * MB;     // Backblaze minimum: >5MB
  if (fileSize < 4 * GB) return 10 * MB;    // Optimal for medium files
  return 25 * MB; // Backblaze max optimal chunk size
};

const getTimeoutByPartSize = (partSize) => {
  if (partSize <= 10 * MB) return 300000;     // 5 min
  if (partSize <= 50 * MB) return 600000;     // 10 min
  if (partSize <= 100 * MB) return 900000;    // 15 min
  return 1200000;                             // 20 min
};

const getConcurrencyBySpeed = (mbps) => {
  if (mbps < 10) return 2;   // slow
  if (mbps < 50) return 4;   // moderate
  if (mbps < 100) return 6;  // fast
  return 10;                 // very fast
};

const getSmartUploadConfig = ({ fileSize, networkMbps }) => {
  const partSize = getDynamicPartSize(fileSize);
  const timeout = getTimeoutByPartSize(partSize);
  const concurrency = getConcurrencyBySpeed(networkMbps);

  return {
    partSize,
    timeout,
    concurrency,
    maxRetries: 3,
    retryDelayBase: 1000,
    retryMultiplier: 2,
  };
};

module.exports = {
  getSmartUploadConfig,
};
