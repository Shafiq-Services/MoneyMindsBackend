/**
 * Set the vault's first "Popular" film to use the given video and thumbnail URLs.
 * Creates or updates a film so it can be pinned first in the popular list.
 *
 * Usage: node scripts/setFeaturedPopularFilm.js
 *
 * Uses these defaults (can override via env):
 *   FEATURED_VIDEO_URL=https://money-minds.s3.us-east-005.backblazeb2.com/videos/films/0611a014-9103-406a-a52b-0ad981ddb461/master.m3u8
 *   FEATURED_POSTER_URL=https://i.ytimg.com/vi/-vYMnda33AY/maxresdefault.jpg
 *
 * Requires .env MONGO_URI.
 */

const path = require('path');
const fs = require('fs');

process.chdir(path.join(__dirname, '..'));
require('dotenv').config();

const envPath = path.join(__dirname, '..', '.env');
if (!process.env.MONGO_URI && fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
}

const mongoose = require('mongoose');
const Video = require('../models/video');

const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('Missing MONGO_URI in .env');
  process.exit(1);
}

const FEATURED_VIDEO_URL = process.env.FEATURED_VIDEO_URL || 'https://money-minds.s3.us-east-005.backblazeb2.com/videos/films/0611a014-9103-406a-a52b-0ad981ddb461/master.m3u8';
const FEATURED_POSTER_URL = process.env.FEATURED_POSTER_URL || 'https://i.ytimg.com/vi/-vYMnda33AY/maxresdefault.jpg';

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const videoIdFromUrl = FEATURED_VIDEO_URL.split('/').filter(Boolean).find(part => /^[0-9a-f-]{36}$/i.test(part)) || '0611a014-9103-406a-a52b-0ad981ddb461';

  let film = await Video.findOne({
    type: 'film',
    $or: [
      { videoUrl: FEATURED_VIDEO_URL },
      { videoUrl: new RegExp(videoIdFromUrl, 'i') }
    ]
  });

  if (film) {
    film.videoUrl = FEATURED_VIDEO_URL;
    film.posterUrl = FEATURED_POSTER_URL;
    if (!film.title) film.title = 'Featured';
    await film.save();
    console.log('Updated film', film._id.toString(), 'with video and poster URLs.');
  } else {
    film = await Video.create({
      title: 'Featured',
      description: 'Featured popular film',
      type: 'film',
      videoUrl: FEATURED_VIDEO_URL,
      posterUrl: FEATURED_POSTER_URL,
      length: 0
    });
    console.log('Created new film', film._id.toString(), 'with video and poster URLs.');
  }

  console.log('\nDone. Restart the server so popular list shows this film first (if getPopularFilms pins by this URL).');
  await mongoose.disconnect();
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
