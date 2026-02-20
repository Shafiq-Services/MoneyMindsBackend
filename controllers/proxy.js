/**
 * Proxy external image and video URLs to avoid CORS and hotlink blocking.
 * Used for poster thumbnails (e.g. i.ytimg.com) and HLS streams (e.g. Backblaze B2).
 */

const axios = require('axios');

const IMAGE_MAX_SIZE = 5 * 1024 * 1024; // 5MB
const VIDEO_CHUNK_TIMEOUT = 30000; // 30s per request

/**
 * GET /api/proxy/image?url=<encoded-url>
 * Fetches the image from the given URL and streams it with the same Content-Type.
 */
async function proxyImage(req, res) {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url query parameter' });
  }
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl.trim());
  } catch {
    return res.status(400).json({ error: 'Invalid url encoding' });
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'URL must be http or https' });
  }

  try {
    const response = await axios.get(targetUrl, {
      responseType: 'stream',
      timeout: 10000,
      maxContentLength: IMAGE_MAX_SIZE,
      maxRedirects: 5,
      headers: {
        'User-Agent': 'MoneyMinds-Proxy/1.0',
        'Accept': 'image/*,*/*'
      },
      validateStatus: (status) => status === 200
    });

    const contentType = response.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=86400'); // 24h
    response.data.pipe(res);
  } catch (err) {
    if (err.response) {
      res.status(err.response.status).send(err.response.statusText || 'Proxy error');
    } else {
      res.status(502).json({ error: 'Failed to fetch image', message: err.message });
    }
  }
}

/**
 * Resolve a relative URI against a base URL.
 * @param {string} baseUrl - e.g. https://example.com/path/master.m3u8
 * @param {string} relative - e.g. 240p/240p.m3u8
 */
function resolveUrl(baseUrl, relative) {
  try {
    const base = new URL(baseUrl);
    return new URL(relative, base.origin + base.pathname.replace(/\/[^/]*$/, '/')).toString();
  } catch {
    return relative;
  }
}

/**
 * GET /api/proxy/video?url=<encoded-url>
 * For .m3u8: fetches playlist and rewrites URIs to go through this proxy so HLS.js can load segments.
 * For .ts or other: streams the response as-is.
 */
async function proxyVideo(req, res) {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid url query parameter' });
  }
  let targetUrl;
  try {
    targetUrl = decodeURIComponent(rawUrl.trim());
  } catch {
    return res.status(400).json({ error: 'Invalid url encoding' });
  }
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return res.status(400).json({ error: 'URL must be http or https' });
  }

  const baseOrigin = `${req.protocol}://${req.get('host')}`;
  const proxyPrefix = `${baseOrigin}/api/proxy/video?url=`;
  const isM3u8Request = targetUrl.includes('.m3u8');

  try {
    if (isM3u8Request) {
      const response = await axios.get(targetUrl, {
        responseType: 'text',
        timeout: VIDEO_CHUNK_TIMEOUT,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'MoneyMinds-Proxy/1.0',
          'Accept': 'application/vnd.apple.mpegurl,*/*'
        },
        validateStatus: (status) => status === 200
      });

      const baseForResolve = targetUrl.replace(/\?.*$/, '');
      const lines = String(response.data).split(/\r?\n/);
      const out = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return line;
        const absolute = resolveUrl(baseForResolve, trimmed);
        return proxyPrefix + encodeURIComponent(absolute);
      }).join('\n');

      res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(out);
    } else {
      const response = await axios.get(targetUrl, {
        responseType: 'stream',
        timeout: VIDEO_CHUNK_TIMEOUT,
        maxRedirects: 5,
        headers: {
          'User-Agent': 'MoneyMinds-Proxy/1.0',
          'Accept': '*/*'
        },
        validateStatus: (status) => status === 200
      });

      res.setHeader('Content-Type', response.headers['content-type'] || 'video/mp2t');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      response.data.pipe(res);
    }
  } catch (err) {
    if (err.response) {
      res.status(err.response.status).send(err.response.statusText || 'Proxy error');
    } else {
      res.status(502).json({ error: 'Failed to fetch video', message: err.message });
    }
  }
}

module.exports = {
  proxyImage,
  proxyVideo
};
