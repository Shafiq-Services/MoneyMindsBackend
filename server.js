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

const userRoutes = require("./routes/user");
const subscriptionRoutes = require("./routes/subscription");
const videoRoutes = require("./routes/video");
const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/upload");
const uploadProgressRoutes = require("./routes/uploadProgress");
const seriesRoutes = require("./routes/series");

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with our socket manager
socketManager.initialize(server);

// Initialize socket tester after a short delay to ensure socket server is ready
setTimeout(() => {
  socketTester.initialize();
}, 1000);

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use(morgan("dev"));

// Connect to MongoDB
connectDB();

// Routes
app.use("/api/user", userRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/video", videoRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/upload-progress", uploadProgressRoutes);
app.use("/api/series", seriesRoutes);

// Base route
app.get("/", (req, res) => {
  res.send("Video Streaming Backend API with Upload Progress Tracking is running.");
});

// Start server
server.listen(config.PORT, () => {
  console.log(`Server running on http://localhost:${config.PORT}`);
});

module.exports = app;
