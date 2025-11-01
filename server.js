require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");
const fs = require("fs");
const path = require("path");

const config = require("./config/config");
const connectDB = require("./config/db");
const socketManager = require("./utils/socketManager");
const { initializeSubscriptionScheduler } = require("./utils/subscriptionScheduler");
const subscriptionController = require('./controllers/subscriptionController');
const subscriptionRoutes = require('./routes/subscription');
const { uploadQueue } = require('./utils/uploadQueue');
const { processUploadJob } = require('./workers/uploadProcessor');

const app = express();
const server = http.createServer(app);

console.log("Server is running");

// Ensure temp upload directories exist to prevent multer errors
try {
  const tempDir = path.join(__dirname, "temp");
  const uploadTempDir = path.join(__dirname, "temp", "uploads");
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  if (!fs.existsSync(uploadTempDir)) {
    fs.mkdirSync(uploadTempDir, { recursive: true });
  }
  console.log("✅ Temp upload directories verified");
} catch (e) {
  console.warn("⚠️ Could not ensure temp upload directories:", e.message);
}

// Configure server for large file uploads
server.timeout = 7200000; // 2 hours
server.maxConnections = 1000;

// Initialize Socket.IO with our socket manager
socketManager.initialize(server);

// Initialize subscription expiry warning scheduler
setTimeout(() => {
  initializeSubscriptionScheduler();
}, 2000); // Wait a bit longer to ensure everything is initialized

// Initialize Bull queue processor for video uploads
console.log('🚀 [Upload Queue] Initializing upload queue processor...');
uploadQueue.process(async (job) => {
  console.log(`📋 [Upload Queue] Processing job: ${job.id}`);
  return await processUploadJob(job);
});
console.log('✅ [Upload Queue] Upload queue processor initialized');

// Stripe webhook endpoint
// This route must be before `express.json()` to receive the raw body
app.post('/api/subscription/webhook', express.raw({type: 'application/json'}), subscriptionController.handleStripeWebhook);

// CORS configuration
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:4173',
    'http://localhost:8080',
    'https://moneyminds-fddbbaejd3c2afdc.canadacentral-01.azurewebsites.net',
    'https://moneyminds-fullstack.web.app',
    'https://money-minds-user.vercel.app',
    'https://money-minds-admin.web.app',
    // Add your production frontend URL here when deployed
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(cors(corsOptions));
// Explicitly handle preflight requests for all routes
app.options('*', cors(corsOptions));

// Increase timeout for large file uploads
app.use((req, res, next) => {
  // Set timeout to 2 hours for upload endpoints
  if (req.path.includes('/upload')) {
    req.setTimeout(7200000); // 2 hours
    res.setTimeout(7200000); // 2 hours
  }
  next();
});

app.use(express.json({ limit: '10gb' }));
app.use(express.urlencoded({ limit: '10gb', extended: true }));
app.use(morgan("dev"));

// Connect to MongoDB
connectDB();

// Environment variable validation
function validateEnvironmentVariables() {
  const requiredVars = ['B2_KEY_ID', 'B2_APPLICATION_KEY', 'B2_BUCKET_ID', 'B2_BUCKET_NAME', 'AZURE_CDN_URL'];
  const missingVars = requiredVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.error('❌ Missing required environment variables:', missingVars);
    console.error('❌ Application requires all environment variables to be configured');
    process.exit(1);
  }
  
  // Validate configurations
  console.log('✅ Azure CDN URL configured:', process.env.AZURE_CDN_URL);
  console.log('✅ Backblaze B2 configuration is complete');
  
  // Validate B2 key format
  if (!process.env.B2_KEY_ID.startsWith('00')) {
    console.warn('⚠️ B2_KEY_ID format appears incorrect - should start with "00"');
  }
}

validateEnvironmentVariables();

// Routes
app.use("/api/user", require('./routes/user'));
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/video", require('./routes/video'));
app.use("/api/chat", require('./routes/chat'));
app.use("/api/upload", require('./routes/upload'));
app.use("/api/contact", require('./routes/contact'));
app.use("/api/series", require('./routes/series'));
app.use("/api/campus", require('./routes/campus'));
app.use("/api/course", require('./routes/course'));
app.use("/api/module", require('./routes/module'));
app.use("/api/lesson", require('./routes/lesson'));
app.use("/api/watch-progress", require('./routes/watchProgress'));
app.use("/api/marketplace", require('./routes/marketplace'));
app.use("/api/book", require('./routes/book'));
app.use("/api/feed", require('./routes/feed'));
app.use("/api/banner", require('./routes/banner'));
app.use("/api/notification", require('./routes/notification'));

// Admin Routes
app.use("/api/admin/email", require('./routes/emailAdmin'));
app.use("/api/admin/user", require('./routes/userAdmin'));
app.use("/api/admin/category", require('./routes/categoryAdmin'));
app.use("/api/admin/channel", require('./routes/channelAdmin'));

// Base route
app.get("/", (req, res) => {
  res.send("Video Streaming Backend API with Upload Progress Tracking is running.");
});

// Start server
server.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

module.exports = app;