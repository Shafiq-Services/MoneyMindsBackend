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
const Notification = require("../models/notification");
const UserNotificationRead = require("../models/userNotificationRead");

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

      // Mark notification as read event
      socket.on("mark-notification-read", async (data) => {
        if (data && data.notificationId) {
          try {
            // First check if it's a broadcast notification
            const notification = await Notification.findById(data.notificationId);
            
            if (!notification) {
              socket.emit("notification-marked-read", {
                notificationId: data.notificationId,
                success: false,
                error: "Notification not found"
              });
              return;
            }

            if (notification.isBroadcastToAll) {
              // Handle broadcast notification read status
              await UserNotificationRead.findOneAndUpdate(
                {
                  userId: userId,
                  notificationId: data.notificationId
                },
                {
                  userId: userId,
                  notificationId: data.notificationId,
                  readAt: new Date()
                },
                { upsert: true, new: true }
              );

              socket.emit("notification-marked-read", {
                notificationId: data.notificationId,
                success: true,
                isBroadcast: true
              });
              console.log(`✅ [Socket Manager] Broadcast notification ${data.notificationId} marked as read for user ${userId}`);
            } else {
              // Handle regular user-specific notification
              const result = await Notification.findOneAndUpdate(
                { 
                  _id: data.notificationId,
                  userId: userId,
                  isRead: false
                },
                { 
                  isRead: true, 
                  readAt: new Date() 
                },
                { new: true }
              );

              if (result) {
                socket.emit("notification-marked-read", {
                  notificationId: data.notificationId,
                  success: true,
                  isBroadcast: false
                });
                console.log(`✅ [Socket Manager] Notification ${data.notificationId} marked as read for user ${userId}`);
              } else {
                socket.emit("notification-marked-read", {
                  notificationId: data.notificationId,
                  success: false,
                  error: "Notification not found, already read, or not yours"
                });
              }
            }
          } catch (error) {
            console.error("❌ [Socket Manager] Error marking notification as read:", error.message);
            socket.emit("notification-marked-read", {
              notificationId: data.notificationId,
              success: false,
              error: "Failed to mark notification as read"
            });
          }
        }
      });

      // Mark all notifications as read event
      socket.on("mark-all-notifications-read", async () => {
        try {
          // Mark user-specific notifications as read
          const userSpecificResult = await Notification.updateMany(
            { 
              userId: userId, 
              isRead: false,
              isBroadcastToAll: { $ne: true }
            },
            { 
              isRead: true, 
              readAt: new Date() 
            }
          );

          // Mark broadcast notifications as read
          const broadcastNotifications = await Notification.find({
            isBroadcastToAll: true
          }).select('_id');

          const broadcastIds = broadcastNotifications.map(n => n._id);
          
          let broadcastResult = { modifiedCount: 0 };
          if (broadcastIds.length > 0) {
            // Get already read broadcast notifications
            const alreadyRead = await UserNotificationRead.find({
              userId: userId,
              notificationId: { $in: broadcastIds }
            }).select('notificationId');

            const alreadyReadIds = alreadyRead.map(r => r.notificationId.toString());
            const unreadBroadcastIds = broadcastIds.filter(id => !alreadyReadIds.includes(id.toString()));

            if (unreadBroadcastIds.length > 0) {
              const readRecords = unreadBroadcastIds.map(notificationId => ({
                userId: userId,
                notificationId: notificationId,
                readAt: new Date()
              }));

              await UserNotificationRead.insertMany(readRecords);
              broadcastResult.modifiedCount = unreadBroadcastIds.length;
            }
          }

          const totalModified = userSpecificResult.modifiedCount + broadcastResult.modifiedCount;

          socket.emit("all-notifications-marked-read", {
            success: true,
            modifiedCount: totalModified,
            userSpecific: userSpecificResult.modifiedCount,
            broadcast: broadcastResult.modifiedCount
          });
          console.log(`✅ [Socket Manager] Marked ${totalModified} notifications as read for user ${userId} (${userSpecificResult.modifiedCount} user-specific, ${broadcastResult.modifiedCount} broadcast)`);
        } catch (error) {
          console.error("❌ [Socket Manager] Error marking all notifications as read:", error.message);
          socket.emit("all-notifications-marked-read", {
            success: false,
            error: "Failed to mark all notifications as read"
          });
        }
      });

      // Get notification unread count event
      socket.on("get-notification-unread-count", async () => {
        try {
          // Count user-specific unread notifications
          const userSpecificUnread = await Notification.countDocuments({
            userId: userId,
            isRead: false,
            isBroadcastToAll: { $ne: true }
          });

          // Count unread broadcast notifications
          const broadcastNotifications = await Notification.find({
            isBroadcastToAll: true
          }).select('_id');

          const broadcastIds = broadcastNotifications.map(n => n._id);
          let unreadBroadcastCount = 0;

          if (broadcastIds.length > 0) {
            const readBroadcasts = await UserNotificationRead.find({
              userId: userId,
              notificationId: { $in: broadcastIds }
            }).select('notificationId');

            const readBroadcastIds = readBroadcasts.map(r => r.notificationId.toString());
            unreadBroadcastCount = broadcastIds.filter(id => !readBroadcastIds.includes(id.toString())).length;
          }

          const totalUnreadCount = userSpecificUnread + unreadBroadcastCount;

          socket.emit("notification-unread-count", {
            success: true,
            unreadCount: totalUnreadCount,
            userSpecific: userSpecificUnread,
            broadcast: unreadBroadcastCount
          });
          console.log(`📊 [Socket Manager] Sent unread count ${totalUnreadCount} to user ${userId} (${userSpecificUnread} user-specific, ${unreadBroadcastCount} broadcast)`);
        } catch (error) {
          console.error("❌ [Socket Manager] Error getting notification unread count:", error.message);
          socket.emit("notification-unread-count", {
            success: false,
            error: "Failed to get unread count"
          });
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

      // Lesson opening event for text-only lessons
      socket.on("lesson-opened", async (data) => {
        console.log('📚 [Socket Manager] Lesson opened event received:', { data, userId });
        
        if (data && data.lessonId) {
          try {
            // Find the lesson
            const Lesson = require('../models/lesson');
            console.log('🔍 [Socket Manager] Looking for lesson:', data.lessonId);
            const lesson = await Lesson.findById(data.lessonId).maxTimeMS(5000); // 5 second timeout
            if (!lesson) {
              console.log('❌ [Socket Manager] Lesson not found:', data.lessonId);
              socket.emit('lesson-opened-error', {
                lessonId: data.lessonId,
                error: 'Lesson not found'
              });
              return;
            }
            console.log('✅ [Socket Manager] Lesson found:', lesson.name);

            // Check if lesson has no video (text-only lesson)
            if (!lesson.videoUrl) {
              console.log('📄 [Socket Manager] Text-only lesson detected, marking as completed...');
              
              // Create or update watch progress for text-only lesson
              await WatchProgress.findOneAndUpdate(
                {
                  userId: userId,
                  videoId: data.lessonId
                },
                {
                  contentType: 'lesson',
                  seconds: 0,
                  percentage: 100,
                  totalDuration: 0,
                  isCompleted: true,
                  lastUpdated: new Date()
                },
                { upsert: true, new: true }
              );
              
              console.log(`✅ [Socket Manager] Text-only lesson ${lesson.name} marked as 100% complete for user ${userId}`);
              
              // Update in-memory progress cache
              if (!this.videoProgress[userId]) this.videoProgress[userId] = {};
              this.videoProgress[userId][data.lessonId] = {
                seconds: 0,
                percentage: 100,
                totalDuration: 0,
                lastUpdated: Date.now()
              };
              
              // Emit confirmation to user
              socket.emit('lesson-opened-confirmed', {
                lessonId: data.lessonId,
                lessonName: lesson.name,
                progress: 100,
                completed: true
              });
              
            } else {
              console.log('🎬 [Socket Manager] Lesson has video, not marking as completed automatically');
              
              // Emit confirmation for video lessons (they need to watch the video)
              socket.emit('lesson-opened-confirmed', {
                lessonId: data.lessonId,
                lessonName: lesson.name,
                hasVideo: true,
                progress: this.getUserVideoProgress(userId, data.lessonId)?.percentage || 0
              });
            }
            
          } catch (error) {
            console.error('❌ [Socket Manager] Error handling lesson-opened event:', error.message);
            socket.emit('lesson-opened-error', {
              lessonId: data.lessonId,
              error: 'Failed to process lesson opening'
            });
          }
        } else {
          console.log('❌ [Socket Manager] Invalid lesson-opened event data:', data);
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
          const userId = socket.userId; // Make sure this is defined
          if (!this.videoProgress[userId]) this.videoProgress[userId] = {};
      
          let progressPercentage = 0;
          let totalDuration = 0;
      
          // Get existing progress from memory
          const existingProgress = this.videoProgress[userId][data.videoId];
      
                  // Fetch video from all schemas that contain video URLs
        let video = await Video.findById(data.videoId);
        
        if (video) {
          totalDuration = video.length || 0;
        } else {
          // Check Lesson schema
          const Lesson = require('../models/lesson');
          const lesson = await Lesson.findById(data.videoId);
          if (lesson) {
            totalDuration = lesson.length || 0;
          } else {
            // Check ChatMessage schema for video messages
            const Message = require('../models/chat-message');
            const message = await Message.findById(data.videoId);
            if (message && message.mediaType === 'video') {
              totalDuration = message.length || 0;
            } else {
              return;
            }
          }
        }
      
          // Calculate progress %
          progressPercentage = totalDuration > 0
            ? Math.round((data.progress / totalDuration) * 100)
            : 0;
      
          // Prevent backward progress
          if (existingProgress && data.progress <= existingProgress.seconds) {
            return;
          }
      
          // Clamp between 0%–100%
          progressPercentage = Math.max(0, Math.min(100, progressPercentage));
      
          const progressData = {
            seconds: data.progress,
            percentage: progressPercentage,
            totalDuration: totalDuration,
            lastUpdated: Date.now(),
          };
      
      
          // Save in memory
          this.videoProgress[userId][data.videoId] = progressData;
      
          // Save to DB (upsert)
          try {
            // Determine content type based on which schema the video was found in
            let contentType = 'video';
            if (video) {
              contentType = 'video';
            } else {
              const Lesson = require('../models/lesson');
              const lesson = await Lesson.findById(data.videoId);
              if (lesson) {
                contentType = 'lesson';
              } else {
                const Message = require('../models/chat-message');
                const message = await Message.findById(data.videoId);
                if (message && message.mediaType === 'video') {
                  contentType = 'chat-message';
                }
              }
            }

            await WatchProgress.findOneAndUpdate(
              {
                userId,
                videoId: data.videoId,
                $or: [
                  { seconds: { $lt: data.progress } },
                  { seconds: { $exists: false } },
                ],
              },
              {
                contentType: contentType,
                seconds: data.progress,
                percentage: progressPercentage,
                totalDuration: totalDuration,
                isCompleted: progressPercentage >= 95, // Mark as completed if 95% or more
                lastUpdated: new Date(),
              },
              { upsert: true, new: true }
            );
          } catch (dbError) {
            console.error('[ERROR] Failed to save watch progress to DB:', dbError.message);
          }
        } else {
          console.warn('[WARN] Invalid data received in video-progress event:', data);
        }
      });;
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

  // Get video duration from stored length field
  async getVideoDuration(video) {
    if (!video) {
      return 0;
    }
    
    // Use stored length if available
    if (video.length && video.length > 0) {
      return video.length;
    }
    
    // Fallback for videos without length (legacy)
    if (!video.videoUrl) {
      return 0;
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
            resolve(0); // Return 0 instead of fallback
          }
        });
      });

    } catch (error) {
      console.log(`Error getting video duration for ${video._id}:`, error.message);
      return 0; // Return 0 instead of fallback
    }
  }

  // NOTIFICATION BROADCAST METHODS

  // Helper method to save notification to database
  async saveNotificationToDatabase(notificationData, userIds = []) {
    try {
      // Skip saving if this is an admin broadcast - it's handled in the controller
      if (notificationData.eventName === 'admin-notification-broadcast') {
        console.log(`📢 [Socket Manager] Skipping database save for admin broadcast - handled in controller`);
        return;
      }

      const notifications = userIds.map(userId => ({
        userId: userId,
        title: notificationData.notification.title,
        message: notificationData.notification.message,
        type: notificationData.notification.type || 'info',
        icon: notificationData.notification.icon || '📢',
        category: this.getCategoryFromEventName(notificationData.eventName),
        relatedEntityId: notificationData._id,
        relatedEntityType: this.getEntityTypeFromEventName(notificationData.eventName),
        campusId: notificationData.campusId || null,
        eventName: notificationData.eventName,
        data: notificationData
      }));

      if (notifications.length > 0) {
        await Notification.insertMany(notifications);
        console.log(`💾 [Socket Manager] Saved ${notifications.length} notifications to database`);
      }
    } catch (error) {
      console.error('❌ [Socket Manager] Failed to save notifications to database:', error.message);
    }
  }

  // Helper method to get category from event name
  getCategoryFromEventName(eventName) {
    const categoryMap = {
      'new-campus-released': 'campus-release',
      'new-film-released': 'film-release',
      'new-series-content-released': 'series-release',
      'new-book-released': 'book-release',
      'new-course-released': 'course-release',
      'new-lesson-released': 'lesson-release',
      'subscription-expiry-warning': 'subscription-warning'
    };
    return categoryMap[eventName] || 'general';
  }

  // Helper method to get entity type from event name
  getEntityTypeFromEventName(eventName) {
    const typeMap = {
      'new-campus-released': 'campus',
      'new-film-released': 'film',
      'new-series-content-released': 'series',
      'new-book-released': 'book',
      'new-course-released': 'course',
      'new-lesson-released': 'lesson',
      'subscription-expiry-warning': 'subscription'
    };
    return typeMap[eventName] || null;
  }

  // Global broadcast to all users
  async broadcastGlobalNotification(eventName, data) {
    console.log(`📢 [Socket Manager] Broadcasting global notification: ${eventName}`);
    
    // Get all user IDs for database storage
    const users = await User.find({}, '_id');
    const userIds = users.map(user => user._id.toString());
    
    // Add eventName to data for database storage
    const notificationData = { ...data, eventName };
    
    // Save to database
    await this.saveNotificationToDatabase(notificationData, userIds);
    
    // Emit socket event
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
    
    // Add eventName and campusId to data for database storage
    const notificationData = { ...data, eventName, campusId };
    
    // Save to database
    await this.saveNotificationToDatabase(notificationData, memberIds);
    
    // Send notification to each campus member
    memberIds.forEach(userId => {
      this.io.to(`user:${userId}`).emit(eventName, data);
    });
  }

  // Send notification to specific user
  async broadcastUserNotification(eventName, data, userId) {
    console.log(`📢 [Socket Manager] Broadcasting user notification: ${eventName} to user ${userId}`);
    
    // Add eventName to data for database storage
    const notificationData = { ...data, eventName };
    
    // Save to database
    await this.saveNotificationToDatabase(notificationData, [userId]);
    
    // Emit socket event
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
    
    await this.broadcastGlobalNotification('new-campus-released', notificationData);
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
    
    await this.broadcastGlobalNotification('new-film-released', notificationData);
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
    
    await this.broadcastGlobalNotification('new-series-content-released', notificationData);
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
    
    await this.broadcastGlobalNotification('new-book-released', notificationData);
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
    
    await this.broadcastUserNotification('subscription-expiry-warning', notificationData, user._id);
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

  // HELPER METHODS

  // Emit any event to a specific user
  emitToUser(userId, eventName, data) {
    this.io.to(`user:${userId}`).emit(eventName, data);
  }
}

// Singleton instance
const socketManager = new SocketManager();

module.exports = socketManager;
