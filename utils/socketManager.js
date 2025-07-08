const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const path = require("path");
const mongoose = require("mongoose");
const Channel = require("../models/channel");
const Campus = require("../models/campus");
const Message = require("../models/chat-message");
const User = require("../models/user");
const Video = require("../models/video");
const WatchProgress = require("../models/watchProgress");
const Book = require("../models/book");

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

      // Book opening event
      socket.on("book-opened", async (data) => {
        console.log('📖 [Socket Manager] Book opened event received:', { data, userId });
        
        if (data && data.bookId) {
          try {
            // Find the book with timeout handling
            console.log('🔍 [Socket Manager] Looking for book:', data.bookId);
            const book = await Book.findById(data.bookId).maxTimeMS(5000); // 5 second timeout
            if (!book) {
              console.log('❌ [Socket Manager] Book not found:', data.bookId);
              socket.emit('book-opened-error', {
                bookId: data.bookId,
                error: 'Book not found'
              });
              return;
            }
            console.log('✅ [Socket Manager] Book found:', book.title);

            // Check if user is already in isOpened array
            const userObjectId = new mongoose.Types.ObjectId(userId);
            const isAlreadyOpened = book.isOpened.some(id => id.equals(userObjectId));

            if (!isAlreadyOpened) {
              // Add user to isOpened array
              console.log('💾 [Socket Manager] Adding user to isOpened array...');
              book.isOpened.push(userObjectId);
              await book.save({ maxTimeMS: 5000 }); // 5 second timeout for save
              
              console.log(`✅ [Socket Manager] User ${userId} added to book "${book.title}" isOpened array`);
              console.log(`📊 [Socket Manager] Book now opened by ${book.isOpened.length} users`);
              
              // Emit to user's personal room to confirm
              socket.emit('book-opened-confirmed', {
                bookId: data.bookId,
                bookTitle: book.title,
                totalOpenedBy: book.isOpened.length
              });
              
              // Optionally emit to other users in the same book context
              socket.to(`book:${data.bookId}`).emit('book-user-joined', {
                bookId: data.bookId,
                userId: userId,
                totalOpenedBy: book.isOpened.length
              });
              
            } else {
              console.log(`⚠️ [Socket Manager] User ${userId} already in book "${book.title}" isOpened array`);
              
              // Still confirm to user
              socket.emit('book-opened-confirmed', {
                bookId: data.bookId,
                bookTitle: book.title,
                totalOpenedBy: book.isOpened.length,
                alreadyOpened: true
              });
            }

            // Join book-specific room for real-time updates
            socket.join(`book:${data.bookId}`);
            
          } catch (error) {
            console.error('❌ [Socket Manager] Error handling book-opened event:', error.message);
            socket.emit('book-opened-error', {
              bookId: data.bookId,
              error: 'Failed to process book opening'
            });
          }
        } else {
          console.log('❌ [Socket Manager] Invalid book-opened event data:', data);
        }
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

  // Called from controller: edit-message
  async handleMessageEdit(editedMessage, channelId, editorId) {
    // Find all users in this channel (campus members)
    const channel = await Channel.findById(channelId).populate("campusId");
    const campus = channel.campusId;
    const memberIds = campus.members.map((m) => m.userId.toString());
    
    // Format the message with isMe flag for each user
    for (const userId of memberIds) {
      const ctx = this.userContext[userId];
      if (ctx && ctx.activeChannelId === channelId) {
        // User is in this channel, emit message-edited
        const messageForUser = {
          ...editedMessage,
          isMe: editedMessage.userId._id.toString() === userId
        };
        this.io.to(`user:${userId}`).emit("message-edited", messageForUser);
      }
    }
  }

  // Called from controller: delete-message
  async handleMessageDelete(messageId, channelId, deleterId) {
    // Find all users in this channel (campus members)
    const channel = await Channel.findById(channelId).populate("campusId");
    const campus = channel.campusId;
    const memberIds = campus.members.map((m) => m.userId.toString());
    
    for (const userId of memberIds) {
      const ctx = this.userContext[userId];
      if (ctx && ctx.activeChannelId === channelId) {
        // User is in this channel, emit message-deleted
        this.io.to(`user:${userId}`).emit("message-deleted", { 
          messageId, 
          channelId,
          deletedBy: deleterId 
        });
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
      console.log(`🔍 [Socket Manager] Loading watch progress for user: ${userId}`);
      const watchProgressList = await WatchProgress.find({ userId });
      console.log(`📊 [Socket Manager] Found ${watchProgressList.length} progress records in database`);
      
      // Initialize user's progress object if not exists
      if (!this.videoProgress[userId]) {
        this.videoProgress[userId] = {};
      }
      
      // Load each progress record into memory
      watchProgressList.forEach(progress => {
        console.log(`📹 [Socket Manager] Loading progress: Video ${progress.videoId} - ${progress.percentage}% (${progress.seconds}s)`);
        this.videoProgress[userId][progress.videoId.toString()] = {
          seconds: progress.seconds,
          percentage: progress.percentage,
          totalDuration: progress.totalDuration,
          lastUpdated: progress.lastUpdated.getTime()
        };
      });
      
      console.log(`✅ [Socket Manager] Loaded ${watchProgressList.length} watch progress records for user ${userId}`);
      console.log(`📊 [Socket Manager] User now has progress for ${Object.keys(this.videoProgress[userId]).length} videos in memory`);
    } catch (error) {
      console.error('❌ [Socket Manager] Failed to load watch progress from database:', error.message);
      console.error('❌ [Socket Manager] Stack:', error.stack);
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

  // NOTIFICATION BROADCAST METHODS

  // Global broadcast to all users
  broadcastGlobalNotification(eventName, data) {
    console.log(`📢 [Socket Manager] Broadcasting global notification: ${eventName}`);
    this.io.emit(eventName, data);
  }

  // Campus-specific broadcast to all campus members
  async broadcastCampusNotification(eventName, data, campusId) {
    console.log(`📢 [Socket Manager] Broadcasting campus notification: ${eventName} to campus ${campusId}`);
    
    // Find all users in this campus
    const campus = await Campus.findById(campusId);
    if (!campus) {
      console.log(`❌ [Socket Manager] Campus ${campusId} not found for notification`);
      return;
    }

    const memberIds = campus.members.map(member => member.userId.toString());
    
    // Send notification to each campus member
    memberIds.forEach(userId => {
      this.io.to(`user:${userId}`).emit(eventName, data);
    });
  }

  // Send notification to specific user
  broadcastUserNotification(eventName, data, userId) {
    console.log(`📢 [Socket Manager] Broadcasting user notification: ${eventName} to user ${userId}`);
    this.io.to(`user:${userId}`).emit(eventName, data);
  }

  // CONTENT RELEASE NOTIFICATIONS

  // New Campus Release (Global)
  async broadcastNewCampusRelease(campus) {
    const notificationData = {
      _id: campus._id,
      slug: campus.slug,
      title: campus.title,
      imageUrl: campus.imageUrl,
      createdAt: campus.createdAt,
      notification: {
        title: "New Campus Available",
        message: `New campus '${campus.title}' is now available to join.`,
        type: "success",
        icon: "✓"
      }
    };
    
    this.broadcastGlobalNotification('new-campus-released', notificationData);
  }

  // New Film Release (Global)
  async broadcastNewFilmRelease(film) {
    const notificationData = {
      _id: film._id,
      title: film.title,
      description: film.description,
      posterUrl: film.posterUrl,
      videoUrl: film.videoUrl,
      createdAt: film.createdAt,
      notification: {
        title: "New Film Released",
        message: `New film '${film.title}' is now available to watch.`,
        type: "success",
        icon: "✓"
      }
    };
    
    this.broadcastGlobalNotification('new-film-released', notificationData);
  }

  // New Series/Season/Episode Release (Global)
  async broadcastNewSeriesContentRelease(content, seriesTitle) {
    const notificationData = {
      _id: content._id,
      seriesId: content.seriesId,
      seriesTitle: seriesTitle,
      type: content.type,
      title: content.title,
      seasonNumber: content.seasonNumber,
      episodeNumber: content.episodeNumber,
      description: content.description,
      posterUrl: content.posterUrl,
      createdAt: content.createdAt,
      notification: {
        title: "New Series Content",
        message: `New ${content.type} '${content.title}' from ${seriesTitle} is now available.`,
        type: "success",
        icon: "✓"
      }
    };
    
    this.broadcastGlobalNotification('new-series-content-released', notificationData);
  }

  // New Book Release (Global)
  async broadcastNewBookRelease(book) {
    const notificationData = {
      _id: book._id,
      title: book.title,
      author: book.author,
      image: book.image,
      content: book.content,
      createdAt: book.createdAt,
      notification: {
        title: "New Book Available",
        message: `New book '${book.title}' by ${book.author} is now available to read.`,
        type: "success",
        icon: "✓"
      }
    };
    
    this.broadcastGlobalNotification('new-book-released', notificationData);
  }

  // New Course Release (Campus Members)
  async broadcastNewCourseRelease(course, campusTitle) {
    const notificationData = {
      _id: course._id,
      campusId: course.campusId,
      campusTitle: campusTitle,
      title: course.title,
      imageUrl: course.imageUrl,
      createdAt: course.createdAt,
      notification: {
        title: "New Course Added",
        message: `New course '${course.title}' was added to ${campusTitle}.`,
        type: "success",
        icon: "✓"
      }
    };
    
    await this.broadcastCampusNotification('new-course-released', notificationData, course.campusId);
  }

  // New Lesson Release (Campus Members)
  async broadcastNewLessonRelease(lesson, courseTitle, campusId, campusTitle) {
    const notificationData = {
      _id: lesson._id,
      courseId: lesson.courseId,
      courseTitle: courseTitle,
      campusId: campusId,
      campusTitle: campusTitle,
      title: lesson.name,
      createdAt: lesson.createdAt,
      notification: {
        title: "New Lesson Added",
        message: `A new lesson was added to the ${courseTitle} course.`,
        type: "success",
        icon: "✓"
      }
    };
    
    await this.broadcastCampusNotification('new-lesson-released', notificationData, campusId);
  }

  // Subscription Expiry Warning (Specific User)
  async broadcastSubscriptionExpiryWarning(subscription, user, campusTitle) {
    const expiryDate = new Date(subscription.currentPeriodEnd);
    const now = new Date();
    const daysRemaining = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));

    const notificationData = {
      _id: subscription._id,
      userId: user._id,
      campusId: subscription.campusId,
      campusTitle: campusTitle,
      expiryDate: subscription.currentPeriodEnd,
      daysRemaining: daysRemaining,
      subscriptionType: subscription.plan,
      notification: {
        title: "Subscription Expiring Soon",
        message: `Your subscription is about to expire in ${daysRemaining} days. Renew now to avoid any service interruptions.`,
        type: "warning",
        icon: "!"
      }
    };
    
    this.broadcastUserNotification('subscription-expiry-warning', notificationData, user._id);
  }

  // UPLOAD PROGRESS TRACKING METHODS

  // Send upload progress to specific user
  broadcastUploadProgress(userId, data) {
    // console.log(`📤 [Socket Manager] Broadcasting upload progress to user ${userId}:`, data);
    this.io.to(`user:${userId}`).emit('upload-progress', data);
  }

  // Send upload completion to specific user
  broadcastUploadComplete(userId, data) {
    console.log(`✅ [Socket Manager] Broadcasting upload complete to user ${userId}:`, data);
    this.io.to(`user:${userId}`).emit('upload-complete', data);
  }

  // Send upload error to specific user
  broadcastUploadError(userId, data) {
    console.log(`❌ [Socket Manager] Broadcasting upload error to user ${userId}:`, data);
    this.io.to(`user:${userId}`).emit('upload-error', data);
  }
}

// Singleton instance
const socketManager = new SocketManager();

module.exports = socketManager;
