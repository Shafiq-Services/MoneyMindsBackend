require("dotenv").config();

const express = require("express");
const http = require("http");
const mongoose = require("mongoose");
const cors = require("cors");
const morgan = require("morgan");

const config = require("./config/config");
const connectDB = require("./config/db");
const socketManager = require("./utils/socketManager");
const socketTester = require("./utils/socketTester");
const subscriptionController = require('./controllers/subscriptionController');
const subscriptionRoutes = require('./routes/subscription');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with our socket manager
socketManager.initialize(server);

// Initialize socket tester after a short delay to ensure socket server is ready
setTimeout(() => {
  socketTester.initialize();
}, 1000);

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
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ limit: '500mb', extended: true }));
app.use(morgan("dev"));

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/user", require('./routes/user'));
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/video", require('./routes/video'));
app.use("/api/film", require('./routes/film'));
app.use("/api/chat", require('./routes/chat'));
app.use("/api/upload", require('./routes/upload'));
app.use("/api/upload-progress", require('./routes/uploadProgress'));
app.use("/api/series", require('./routes/series'));
app.use("/api/campus", require('./routes/campus'));
app.use("/api/course", require('./routes/course'));
app.use("/api/module", require('./routes/module'));
app.use("/api/lesson", require('./routes/lesson'));

// Base route
app.get("/", (req, res) => {
  res.send("Video Streaming Backend API with Upload Progress Tracking is running.");
});

// Start server
server.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

module.exports = app;
