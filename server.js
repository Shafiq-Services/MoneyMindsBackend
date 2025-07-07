require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");

const config = require("./config/config");
const connectDB = require("./config/db");
const socketManager = require("./utils/socketManager");
const { initializeSubscriptionScheduler } = require("./utils/subscriptionScheduler");
const subscriptionController = require('./controllers/subscriptionController');
const subscriptionRoutes = require('./routes/subscription');

const app = express();
const server = http.createServer(app);

// Configure server for large file uploads
server.timeout = 7200000; // 2 hours
server.maxConnections = 1000;

// Initialize Socket.IO with our socket manager
socketManager.initialize(server);

// Initialize subscription expiry warning scheduler
setTimeout(() => {
  initializeSubscriptionScheduler();
}, 2000); // Wait a bit longer to ensure everything is initialized

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
    // Add your production frontend URL here when deployed
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

// Middleware
app.use(cors(corsOptions));

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

// Base route
app.get("/", (req, res) => {
  res.send("Video Streaming Backend API with Upload Progress Tracking is running.");
});

// Start server
server.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

module.exports = app;
