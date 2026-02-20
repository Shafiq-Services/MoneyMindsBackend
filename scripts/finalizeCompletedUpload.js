/**
 * Finalize a completed upload job so it is "completely uploaded":
 * 1. Update the job's result.videoUrl and result.originalVideoUrl to full URLs (if stored as relative).
 * 2. Create a Video (film) document in the videos collection so the film appears in the app.
 *
 * Usage: node scripts/finalizeCompletedUpload.js <uploadId>
 * Example: node scripts/finalizeCompletedUpload.js 0611a014-9103-406a-a52b-0ad981ddb461
 *
 * Requires .env (MONGO_URI, B2_BUCKET_NAME, B2_REGION) when run from project root.
 */

const path = require('path');
// Load .env from project root
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mongoose = require('mongoose');
const UploadJob = require('../models/uploadJob');
const Video = require('../models/video');

const B2_BUCKET = process.env.B2_BUCKET_NAME || 'money-minds';
const B2_REGION = process.env.B2_REGION || 'us-east-005';
const B2_BASE = `https://${B2_BUCKET}.s3.${B2_REGION}.backblazeb2.com`;
function toFullUrl(relativePath) {
  if (!relativePath) return relativePath;
  if (relativePath.startsWith('http')) {
    if (relativePath.includes('undefined.s3.')) {
      const m = relativePath.match(/https?:\/\/[^/]+\/(.+)/);
      relativePath = m ? m[1] : relativePath;
    } else {
      return relativePath;
    }
  }
  return B2_BASE + '/' + relativePath;
}

const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://offshafiqahmad:moneyminds123%40%24%5E@cluster0.csfr1qq.mongodb.net/moneyminds?retryWrites=true&w=majority&appName=Cluster0';

const uploadId = process.argv[2];
if (!uploadId) {
  console.error('Usage: node scripts/finalizeCompletedUpload.js <uploadId>');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGO_URI);
  console.log('Connected to MongoDB\n');

  const job = await UploadJob.findOne({ uploadId }).lean();
  if (!job) {
    console.error('Upload job not found for uploadId:', uploadId);
    await mongoose.disconnect();
    process.exit(1);
  }
  if (job.status !== 'completed' || !job.result || !job.result.videoUrl) {
    console.error('Job is not completed or has no result.videoUrl:', job.status, job.result?.videoUrl);
    await mongoose.disconnect();
    process.exit(1);
  }

  const result = job.result;
  const fullVideoUrl = toFullUrl(result.videoUrl);
  const fullOriginalUrl = result.originalVideoUrl ? toFullUrl(result.originalVideoUrl) : '';

  // 1) Update job with full URLs in result (so DB has consistent full URLs)
  await UploadJob.findOneAndUpdate(
    { uploadId },
    {
      $set: {
        'result.videoUrl': fullVideoUrl,
        'result.originalVideoUrl': fullOriginalUrl || undefined
      }
    },
    { new: true }
  );
  console.log('Updated upload job with full URLs in result.');
  console.log('  videoUrl:', fullVideoUrl);
  console.log('  originalVideoUrl:', fullOriginalUrl || '(none)');

  // 2) Create or update Video (film) so it appears in the app with correct URLs
  const existingFilm = await Video.findOne({
    type: 'film',
    $or: [
      { videoUrl: fullVideoUrl },
      { videoUrl: result.videoUrl },
      { originalVideoUrl: fullOriginalUrl || result.originalVideoUrl },
      { videoUrl: new RegExp(uploadId) }
    ]
  });
  const resolutions = (result.resolutions || []).map((r) => String(r));
  const duration = result.duration != null ? Math.round(Number(result.duration)) : 0;
  const title = (job.originalFileName && job.originalFileName.replace(/\.[^.]+$/, '')) || `Film ${uploadId.slice(0, 8)}`;

  if (existingFilm) {
    await Video.findByIdAndUpdate(existingFilm._id, {
      videoUrl: fullVideoUrl,
      originalVideoUrl: fullOriginalUrl || existingFilm.originalVideoUrl,
      resolutions: resolutions.length ? resolutions : existingFilm.resolutions,
      length: duration || existingFilm.length,
      ...(title && { title })
    });
    console.log('\nUpdated existing Video (film) in videos collection:', existingFilm._id, existingFilm.title || title);
    console.log('  videoUrl:', fullVideoUrl);
  } else {
    const video = await Video.create({
      title,
      type: 'film',
      videoUrl: fullVideoUrl,
      originalVideoUrl: fullOriginalUrl || undefined,
      resolutions,
      length: duration
    });
    console.log('\nCreated Video (film) in videos collection:');
    console.log('  _id:', video._id);
    console.log('  title:', video.title);
    console.log('  videoUrl:', video.videoUrl);
    console.log('  resolutions:', video.resolutions);
    console.log('  length:', video.length, 's');
  }

  await mongoose.disconnect();
  console.log('\nDone. Upload is now fully finalized and the film will appear in the app.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
