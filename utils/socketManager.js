const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const Channel = require('../models/channel');
const Campus = require('../models/campus');
const Message = require('../models/chat-message');
const User = require('../models/user');
const Video = require('../models/video');

class SocketManager {
  constructor() {
    this.io = null;
    this.connectedClients = new Map();
    // In-memory user context: { [userId]: { inList: bool, activeChannelId: string|null, socketId: string } }
    this.userContext = {};
    // In-memory unread state: { [userId]: { [channelId]: lastReadAt } }
    this.lastReadAt = {};
    // Add in-memory video progress tracking: { [userId]: { [videoId]: progress } }
    this.videoProgress = {};
  }

  initialize(server) {
    this.io = new Server(server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });

    this.io.on('connection', async (socket) => {
      // JWT auth via query param or handshake
      let token = socket.handshake.auth?.token || socket.handshake.query?.token;
      let userId;
      try {
        if (!token) throw new Error('No token');
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        userId = decoded.id;
        socket.userId = userId;
      } catch (err) {
        socket.disconnect();
        return;
      }
      // Track socketId for user
      this.userContext[userId] = this.userContext[userId] || { inList: false, activeChannelId: null };
      this.userContext[userId].socketId = socket.id;
      // Join personal room
      socket.join(`user:${userId}`);
      // Join all channel rooms for user's campuses
      const campuses = await Campus.find({ 'members.userId': userId });
      const campusIds = campuses.map(c => c._id.toString());
      const channels = await Channel.find({ campusId: { $in: campusIds } });
      channels.forEach(ch => {
        socket.join(`channel:${ch._id}`);
      });
      // Typing events
      socket.on('user-typing', (data) => {
        if (data && data.channelId) {
          socket.to(`channel:${data.channelId}`).emit('user-typing', { userId, channelId: data.channelId });
        }
      });
      socket.on('typing-stopped', (data) => {
        if (data && data.channelId) {
          socket.to(`channel:${data.channelId}`).emit('typing-stopped', { userId, channelId: data.channelId });
        }
      });
      // Exit channel list event
      socket.on('exit-channel-list', () => {
        if (this.userContext[userId]) {
          this.userContext[userId].inList = false;
          this.userContext[userId].activeChannelId = null;
        }
      });
      socket.on('disconnect', () => {
        // Optionally clean up userContext
        if (this.userContext[userId]) {
          delete this.userContext[userId].socketId;
        }
      });
      // Video progress event
      socket.on('video-progress', async (data) => {
        if (data && data.videoId && typeof data.progress === 'number') {
          if (!this.videoProgress[userId]) this.videoProgress[userId] = {};
          
          // Get video details to calculate percentage from seconds
          const video = await Video.findById(data.videoId);
          
          let progressPercentage = 0;
          
          if (video && video.videoUrl) {
            // Calculate percentage from video URL metadata
            try {
              const axios = require('axios');
              
              // Try to get duration from HLS playlist
              if (video.videoUrl.endsWith('.m3u8')) {
                const response = await axios.get(video.videoUrl, { timeout: 5000 });
                const lines = response.data.split('\n');
                
                // Look for duration in HLS playlist
                let totalDuration = 0;
                for (let i = 0; i < lines.length; i++) {
                  const line = lines[i].trim();
                  if (line.startsWith('#EXTINF:')) {
                    // Extract duration from #EXTINF:duration, format
                    const durationMatch = line.match(/#EXTINF:([\d.]+)/);
                    if (durationMatch) {
                      totalDuration += parseFloat(durationMatch[1]);
                    }
                  }
                }
                
                if (totalDuration > 0) {
                  progressPercentage = Math.round((data.progress / totalDuration) * 100);
                }
              }
              
              // If HLS parsing failed or not HLS, use fallback
              if (progressPercentage === 0) {
                // Fallback: estimate percentage assuming average video length (30 minutes)
                progressPercentage = Math.min(Math.round((data.progress / 1800) * 100), 100);
              }
              
            } catch (error) {
              console.log('Could not fetch video metadata, using fallback calculation');
              // Fallback: estimate percentage assuming average video length (30 minutes)
              progressPercentage = Math.min(Math.round((data.progress / 1800) * 100), 100);
            }
          } else {
            // Fallback: estimate percentage assuming average video length (30 minutes)
            progressPercentage = Math.min(Math.round((data.progress / 1800) * 100), 100);
          }
          
          // Ensure percentage is between 0 and 100
          progressPercentage = Math.max(0, Math.min(100, progressPercentage));
          
          // Store the calculated percentage
          this.videoProgress[userId][data.videoId] = progressPercentage;
        }
      });
    });
    return this.io;
  }

  // Called from controller: user called GET /channel/list
  markInList(userId) {
    this.userContext[userId] = this.userContext[userId] || { inList: false, activeChannelId: null };
    this.userContext[userId].inList = true;
    this.userContext[userId].activeChannelId = null;
  }

  // Called from controller: user called GET /channel/messages?pageNo=1
  markInChannel(userId, channelId) {
    this.userContext[userId] = this.userContext[userId] || { inList: false, activeChannelId: null };
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
    const channel = await Channel.findById(channelId).populate('campusId');
    const campus = channel.campusId;
    const memberIds = campus.members.map(m => m.userId.toString());
    for (const userId of memberIds) {
      // Skip sender for unread
      if (userId === senderId.toString()) continue;
      // If user is in this channel, emit new-message
      const ctx = this.userContext[userId];
      if (ctx && ctx.activeChannelId === channelId) {
        this.io.to(`user:${userId}`).emit('new-message', message);
        // Reset unread count
        if (!this.lastReadAt[userId]) this.lastReadAt[userId] = {};
        this.lastReadAt[userId][channelId] = new Date();
      } else if (ctx && ctx.inList) {
        // If user is in channel list, emit unread-count-updated
        const unreadCount = await this.getUnreadCount(userId, channelId);
        this.io.to(`user:${userId}`).emit('unread-count-updated', { channelId, unreadCount });
      } else if (ctx && ctx.activeChannelId && ctx.activeChannelId !== channelId) {
        // User is in another channel, include unread counts in message object
        const unreadCounts = await this.getAllUnreadCounts(userId);
        this.io.to(`user:${userId}`).emit('new-message', { ...message, unreadCounts });
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
    return await Message.countDocuments({ channelId, createdAt: { $gt: lastRead } });
  }

  // Get all unread counts for a user (for all their channels)
  async getAllUnreadCounts(userId) {
    const campuses = await Campus.find({ 'members.userId': userId });
    const campusIds = campuses.map(c => c._id.toString());
    const channels = await Channel.find({ campusId: { $in: campusIds } });
    const result = {};
    for (const ch of channels) {
      result[ch._id] = await this.getUnreadCount(userId, ch._id);
    }
    return result;
  }
}

// Singleton instance
const socketManager = new SocketManager();

module.exports = socketManager; 