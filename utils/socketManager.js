const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const path = require("path");
const Channel = require("../models/channel");
const Campus = require("../models/campus");
const Message = require("../models/chat-message");
const User = require("../models/user");
const Video = require("../models/video");
const WatchProgress = require("../models/watchProgress");

//Events
const { handleUserLike } = require("../events/likeEvents");

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
    // In-memory user context: { [userId]: { inList: bool, activeChannelId: string|null, socketId: string } }
    this.userContext = {};
    // In-memory unread state: { [userId]: { [channelId]: lastReadAt } }
    this.lastReadAt = {};
    // Add in-memory video progress tracking: { [userId]: { [videoId]: { seconds: number, percentage: number, totalDuration: number, lastUpdated: number } } }
    this.videoProgress = {};
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
      },
    });

    this.io.on("connection", async (socket) => {
      console.log("Socket connection attempt from:", socket.handshake.address);
      
      // JWT auth via query param or handshake
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;
      let userId;
      try {
        if (!token) {
          console.log("No token provided in socket connection");
          throw new Error("No token");
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        socket.userId = userId;
      } catch (err) {
        console.log("Socket authentication failed:", err.message);
        socket.disconnect();
        return;
      }
      // Track socketId for user
      this.userContext[userId] = this.userContext[userId] || {
        inList: false,
        activeChannelId: null,
      };
      this.userContext[userId].socketId = socket.id;
      
      // Load user's watch progress from database to memory cache
      this.loadUserWatchProgress(userId);
      
      // Join personal room
      socket.join(`user:${userId}`);
      // Join all channel rooms for user's campuses
      const campuses = await Campus.find({ "members.userId": userId });
      const campusIds = campuses.map((c) => c._id.toString());
      const channels = await Channel.find({ campusId: { $in: campusIds } });
      channels.forEach((ch) => {
        socket.join(`channel:${ch._id}`);
      });
      // Typing events
      socket.on("user-typing", (data) => {
        if (data && data.channelId) {
          socket
            .to(`channel:${data.channelId}`)
            .emit("user-typing", { userId, channelId: data.channelId });
        }
      });
      socket.on("typing-stopped", (data) => {
        if (data && data.channelId) {
          socket
            .to(`channel:${data.channelId}`)
            .emit("typing-stopped", { userId, channelId: data.channelId });
        }
      });
      // Exit channel list event
      socket.on("exit-channel-list", () => {
        if (this.userContext[userId]) {
          this.userContext[userId].inList = false;
          this.userContext[userId].activeChannelId = null;
        }
      });

      // Like Feed event
      socket.on("like-feed", async (data) => {
        console.log("Like feed event received:", { data, userId });
        // Add userId to the data object
        const likeData = {
          ...data,
          userId: userId
        };
        await handleUserLike(likeData);
      });

      socket.on("disconnect", () => {
        // Optionally clean up userContext
        if (this.userContext[userId]) {
          delete this.userContext[userId].socketId;
        }
      });
      // Video progress event
      socket.on("video-progress", async (data) => {
        if (data && data.videoId && typeof data.progress === "number") {
          if (!this.videoProgress[userId]) this.videoProgress[userId] = {};

          let progressPercentage = 0;
          let totalDuration = 0;

          // Check if we already have cached duration for this video
          const existingProgress = this.videoProgress[userId][data.videoId];
          if (existingProgress && existingProgress.totalDuration > 0) {
            // Use cached duration for efficiency
            totalDuration = existingProgress.totalDuration;
            progressPercentage = Math.round((data.progress / totalDuration) * 100);
            
            // IMPORTANT: Only allow forward progress - never go backward
            if (data.progress <= existingProgress.seconds) {
              console.log(`Progress not updated: ${data.progress}s <= existing ${existingProgress.seconds}s for video ${data.videoId}`);
              return; // Don't update if new progress is less than or equal to existing
            }
          } else {
            // Get video details to calculate duration (only first time)
            const video = await Video.findById(data.videoId);
            totalDuration = await this.getVideoDuration(video);
            progressPercentage = Math.round((data.progress / totalDuration) * 100);
          }

          // Ensure percentage is between 0 and 100
          progressPercentage = Math.max(0, Math.min(100, progressPercentage));

          // Store both seconds and percentage with timestamp
          const progressData = {
            seconds: data.progress,
            percentage: progressPercentage,
            totalDuration: totalDuration,
            lastUpdated: Date.now(),
          };
          
          console.log(`Progress updated: ${data.progress}s (${progressPercentage}%) for video ${data.videoId}`);
          
          // Update in-memory cache for fast access
          this.videoProgress[userId][data.videoId] = progressData;
          
          // Save to MongoDB (upsert) - only update if progress is forward
          try {
            await WatchProgress.findOneAndUpdate(
              { 
                userId, 
                videoId: data.videoId,
                $or: [
                  { seconds: { $lt: data.progress } }, // Only update if new progress is greater
                  { seconds: { $exists: false } } // Or if no progress exists yet
                ]
              },
              {
                seconds: data.progress,
                percentage: progressPercentage,
                totalDuration: totalDuration,
                lastUpdated: new Date()
              },
              { upsert: true, new: true }
            );
          } catch (dbError) {
            console.error('Failed to save watch progress to database:', dbError.message);
            // Continue with in-memory storage even if DB fails
          }
        }
      });
    });
    return this.io;
  }

  // Called from controller: user called GET /channel/list
  markInList(userId) {
    this.userContext[userId] = this.userContext[userId] || {
      inList: false,
      activeChannelId: null,
    };
    this.userContext[userId].inList = true;
    this.userContext[userId].activeChannelId = null;
  }

  // Called from controller: user called GET /channel/messages?pageNo=1
  markInChannel(userId, channelId) {
    this.userContext[userId] = this.userContext[userId] || {
      inList: false,
      activeChannelId: null,
    };
    this.userContext[userId].inList = false;
    this.userContext[userId].activeChannelId = channelId;
    // Reset unread count (update lastReadAt)
    if (!this.lastReadAt[userId]) this.lastReadAt[userId] = {};
    this.lastReadAt[userId][channelId] = new Date();
  }

  // Called from controller: user called GET /channel/messages?pageNo=1 for a new channel
  exitOtherChannels(userId, newChannelId) {
    if (this.userContext[userId]) {
      this.userContext[userId].activeChannelId = newChannelId;
    }
  }

  // Called from controller: send-message
  async handleSendMessage(message, channelId, senderId) {
    // Find all users in this channel (campus members)
    const channel = await Channel.findById(channelId).populate("campusId");
    const campus = channel.campusId;
    const memberIds = campus.members.map((m) => m.userId.toString());
    for (const userId of memberIds) {
      // Skip sender for unread
      if (userId === senderId.toString()) continue;
      // If user is in this channel, emit new-message
      const ctx = this.userContext[userId];
      if (ctx && ctx.activeChannelId === channelId) {
        this.io.to(`user:${userId}`).emit("new-message", message);
        // Reset unread count
        if (!this.lastReadAt[userId]) this.lastReadAt[userId] = {};
        this.lastReadAt[userId][channelId] = new Date();
      } else if (ctx && ctx.inList) {
        // If user is in channel list, emit unread-count-updated
        const unreadCount = await this.getUnreadCount(userId, channelId);
        this.io
          .to(`user:${userId}`)
          .emit("unread-count-updated", { channelId, unreadCount });
      } else if (
        ctx &&
        ctx.activeChannelId &&
        ctx.activeChannelId !== channelId
      ) {
        // User is in another channel, include unread counts in message object
        const unreadCounts = await this.getAllUnreadCounts(userId);
        this.io
          .to(`user:${userId}`)
          .emit("new-message", { ...message, unreadCounts });
      } else {
        // User is not in list or any channel: increment unread count only
        // (No emit needed)
      }
    }
  }

  // Get unread count for a user/channel
  async getUnreadCount(userId, channelId) {
    const lastRead = this.lastReadAt[userId]?.[channelId];
    if (!lastRead) {
      // All messages are unread
      return await Message.countDocuments({ channelId });
    }
    return await Message.countDocuments({
      channelId,
      createdAt: { $gt: lastRead },
    });
  }

  // Get all unread counts for a user (for all their channels)
  async getAllUnreadCounts(userId) {
    const campuses = await Campus.find({ "members.userId": userId });
    const campusIds = campuses.map((c) => c._id.toString());
    const channels = await Channel.find({ campusId: { $in: campusIds } });
    const result = {};
    for (const ch of channels) {
      result[ch._id] = await this.getUnreadCount(userId, ch._id);
    }
    return result;
  }

  // Load user's watch progress from database to memory cache
  async loadUserWatchProgress(userId) {
    try {
      const watchProgressList = await WatchProgress.find({ userId });
      
      // Initialize user's progress object if not exists
      if (!this.videoProgress[userId]) {
        this.videoProgress[userId] = {};
      }
      
      // Load each progress record into memory
      watchProgressList.forEach(progress => {
        this.videoProgress[userId][progress.videoId.toString()] = {
          seconds: progress.seconds,
          percentage: progress.percentage,
          totalDuration: progress.totalDuration,
          lastUpdated: progress.lastUpdated.getTime()
        };
      });
      
      console.log(`Loaded ${watchProgressList.length} watch progress records for user ${userId}`);
    } catch (error) {
      console.error('Failed to load watch progress from database:', error.message);
      // Initialize empty progress object if DB load fails
      if (!this.videoProgress[userId]) {
        this.videoProgress[userId] = {};
      }
    }
  }

  // Get current watch progress for a user and video
  getUserVideoProgress(userId, videoId) {
    if (!this.videoProgress[userId] || !this.videoProgress[userId][videoId]) {
      return null;
    }
    return this.videoProgress[userId][videoId];
  }

  // Get video duration efficiently with caching
  async getVideoDuration(video) {
    if (!video || !video.videoUrl) {
      return 1800; // 30 minutes fallback
    }

    try {
      // Method 1: Try HLS playlist parsing (for .m3u8 files)
      if (video.videoUrl.endsWith(".m3u8")) {
        const axios = require("axios");
        const response = await axios.get(video.videoUrl, { timeout: 5000 });
        const lines = response.data.split("\n");
        let totalDuration = 0;

        for (const line of lines) {
          if (line.trim().startsWith("#EXTINF:")) {
            const durationMatch = line.match(/#EXTINF:([\d.]+)/);
            if (durationMatch) {
              totalDuration += parseFloat(durationMatch[1]);
            }
          }
        }

        if (totalDuration > 0) {
          return totalDuration;
        }
      }

      // Method 2: Try ffprobe for direct video files
      const ffmpeg = require("fluent-ffmpeg");
      const os = require("os");

      // Use custom binaries only on Linux
      if (os.platform() !== "win32") {
        ffmpeg.setFfmpegPath(path.join(__dirname, "../bin", "ffmpeg"));
        ffmpeg.setFfprobePath(path.join(__dirname, "../bin", "ffprobe"));
      }

      return new Promise((resolve) => {
        ffmpeg.ffprobe(video.videoUrl, (err, metadata) => {
          if (!err && metadata && metadata.format && metadata.format.duration) {
            resolve(metadata.format.duration);
          } else {
            console.log(`Could not get duration for video ${video._id}, using fallback`);
            resolve(1800); // 30 minutes fallback
          }
        });
      });

    } catch (error) {
      console.log(`Error getting video duration for ${video._id}:`, error.message);
      return 1800; // 30 minutes fallback
    }
  }
}

// Singleton instance
const socketManager = new SocketManager();

module.exports = socketManager;
