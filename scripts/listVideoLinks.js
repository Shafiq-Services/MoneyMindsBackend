/**
 * List all video links in the database with:
 * - Where they belong (collection + document context)
 * - Highest resolution only (per video)
 *
 * Usage: node scripts/listVideoLinks.js
 * Optional: MONGO_URI="your-uri" node scripts/listVideoLinks.js
 */

const mongoose = require('mongoose');
const Video = require('../models/video');
const Lesson = require('../models/lesson');
const Module = require('../models/module');
const Course = require('../models/course');
const Series = require('../models/series');
const Message = require('../models/chat-message');
const Channel = require('../models/channel');
const UploadJob = require('../models/uploadJob');

const MONGO_URI =
  process.env.MONGO_URI ||
  'mongodb+srv://offshafiqahmad:moneyminds123%40%24%5E@cluster0.csfr1qq.mongodb.net/moneyminds?retryWrites=true&w=majority&appName=Cluster0';

function getHighestResolution(resolutions) {
  if (!resolutions || !Array.isArray(resolutions) || resolutions.length === 0)
    return null;
  const numeric = resolutions.map((r) => (typeof r === 'string' ? parseInt(r, 10) : r)).filter((n) => !Number.isNaN(n));
  return numeric.length ? Math.max(...numeric) : null;
}

function formatResolution(res) {
  return res != null ? `${res}p` : '—';
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const rows = [];

  // 1) Videos (films/episodes)
  const videos = await Video.find({ videoUrl: { $exists: true, $ne: '' } })
    .lean()
    .populate('seriesId', 'title');
  for (const v of videos) {
    const highest = getHighestResolution(v.resolutions);
    const location =
      v.type === 'episode' && v.seriesId
        ? `Video (episode) | ${v.seriesId.title} | S${v.seasonNumber || '?'} E${v.episodeNumber || '?'} | ${v.title || 'Untitled'} | _id: ${v._id}`
        : `Video (${v.type || 'film'}) | ${v.title || 'Untitled'} | _id: ${v._id}`;
    rows.push({
      link: v.videoUrl,
      location,
      collection: 'videos',
      docId: String(v._id),
      highestResolution: formatResolution(highest),
    });
  }

  // 2) Lessons (Course > Module > Lesson)
  const lessons = await Lesson.find({ videoUrl: { $exists: true, $ne: '' } })
    .lean()
    .populate({ path: 'moduleId', populate: { path: 'courseId', select: 'title' } });
  for (const l of lessons) {
    const mod = l.moduleId;
    const course = mod?.courseId;
    const courseTitle = course?.title || '?';
    const moduleName = mod?.name || '?';
    const location = `Lesson | Course: ${courseTitle} > Module: ${moduleName} > "${l.name}" | _id: ${l._id}`;
    const highest = getHighestResolution(l.resolutions);
    rows.push({
      link: l.videoUrl,
      location,
      collection: 'lessons',
      docId: String(l._id),
      highestResolution: formatResolution(highest),
    });
  }

  // 3) Chat messages (video)
  const messages = await Message.find({
    mediaType: 'video',
    mediaUrl: { $exists: true, $ne: '' },
  })
    .lean()
    .populate('channelId', 'name');
  for (const m of messages) {
    const chName = m.channelId?.name || '?';
    const location = `Message (chat) | Channel: ${chName} | _id: ${m._id}`;
    rows.push({
      link: m.mediaUrl,
      location,
      collection: 'messages',
      docId: String(m._id),
      highestResolution: '—',
    });
  }

  // 4) Completed upload jobs (result.videoUrl) – optional, may duplicate above
  const uploadJobs = await UploadJob.find({
    'result.videoUrl': { $exists: true, $ne: '' },
    status: 'completed',
  }).lean();
  for (const u of uploadJobs) {
    const url = u.result?.videoUrl;
    if (!url) continue;
    const highest = getHighestResolution(u.result?.resolutions);
    const location = `UploadJob (${u.type || u.uploadType || 'video'}) | uploadId: ${u.uploadId} | _id: ${u._id}`;
    rows.push({
      link: url,
      location,
      collection: 'uploadjobs',
      docId: String(u._id),
      highestResolution: formatResolution(highest),
    });
  }

  // Print report
  console.log('========== VIDEO LINKS (with location and highest resolution) ==========\n');
  console.log(`Total entries: ${rows.length}\n`);

  const sep = '\n' + '-'.repeat(100) + '\n';
  rows.forEach((r, i) => {
    console.log(`[${i + 1}] ${r.link}`);
    console.log(`    Where: ${r.location}`);
    console.log(`    Collection: ${r.collection} | Doc ID: ${r.docId}`);
    console.log(`    Highest resolution: ${r.highestResolution}`);
    console.log(sep);
  });

  // Summary by collection
  const byCollection = {};
  rows.forEach((r) => {
    byCollection[r.collection] = (byCollection[r.collection] || 0) + 1;
  });
  console.log('Summary by collection:', byCollection);

  await mongoose.disconnect();
  console.log('\nDisconnected from MongoDB.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
