const Channel = require('../models/channel');
const ChatCategory = require('../models/chat-category');
const Message = require('../models/chat-message');
const Campus = require('../models/campus');
const User = require('../models/user');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { getCampusWithMembershipCheck } = require('../utils/campusHelpers');
const { paginateQuery } = require('../utils/pagination');
const socketManager = require('../utils/socketManager');

// POST /channel/add
const addChannel = async (req, res) => {
  try {
    const { campusId, name, category } = req.body;
    const userId = req.userId;
    if (!campusId || !name) {
      return errorResponse(res, 400, 'campusId and name are required');
    }
    // Check campus exists
    const campus = await Campus.findById(campusId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    // Handle category (default to GENERAL if not provided)
    let categoryDoc;
    if (category) {
      categoryDoc = await ChatCategory.findOne({ slug: category.toUpperCase() });
      if (!categoryDoc) {
        return errorResponse(res, 404, 'Category not found');
      }
    } else {
      categoryDoc = await ChatCategory.findOne({ slug: 'GENERAL' });
      if (!categoryDoc) {
        categoryDoc = await ChatCategory.create({ slug: 'GENERAL', createdBy: userId });
      }
    }
    // Create channel
    const channel = await Channel.create({
      name,
      campusId,
      category: categoryDoc._id,
      createdBy: userId
    });
    return successResponse(res, 201, 'Channel created successfully', channel, 'channel');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to create channel', err.message);
  }
};

// GET /channel/list?campusId=...
const listChannels = async (req, res) => {
  try {
    const { campusId } = req.query;
    const userId = req.userId;
    if (!campusId) {
      return errorResponse(res, 400, 'campusId is required');
    }
    // Check campus and membership
    const { campus, isMember } = await getCampusWithMembershipCheck(campusId, userId);
    if (!campus) {
      return errorResponse(res, 404, 'Campus not found');
    }
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view channels');
    }
    // Mark user as in channel list view
    socketManager.markInList(userId);
    // List channels grouped by category
    const channels = await Channel.find({ campusId }).populate('category').sort({ 'category.slug': 1, name: 1 });
    // Group by category and add unreadCount
    const grouped = {};
    for (const ch of channels) {
      const cat = ch.category ? ch.category.slug : 'GENERAL';
      if (!grouped[cat]) grouped[cat] = [];
      const unreadCount = await socketManager.getUnreadCount(userId, ch._id);
      grouped[cat].push({ ...ch.toObject(), unreadCount });
    }
    return successResponse(res, 200, 'Channels listed successfully', grouped, 'channels');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to list channels', err.message);
  }
};

// POST /channel/message
const sendMessage = async (req, res) => {
  try {
    const { channelId, text, mediaUrl, mediaType } = req.body;
    const userId = req.userId;
    if (!channelId) {
      return errorResponse(res, 400, 'channelId is required');
    }
    if (!text && !mediaUrl) {
      return errorResponse(res, 400, 'Message must contain text or mediaUrl');
    }

    // Check channel exists
    const channel = await Channel.findById(channelId).populate('campusId');
    if (!channel) {
      return errorResponse(res, 404, 'Channel not found');
    }
    // Check user is member of campus
    const { isMember } = await getCampusWithMembershipCheck(channel.campusId._id, userId);
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to send messages');
    }
    // Create message
    const message = await Message.create({
      channelId,
      userId,
      text: text || '',
      mediaUrl,
      mediaType
    });
    // Emit real-time events and update unread counts
    await socketManager.handleSendMessage(message.toObject(), channelId, userId);
    return successResponse(res, 201, 'Message sent successfully', message, 'message');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to send message', err.message);
  }
};

// GET /channel/members?channelId=...
const getChannelMembers = async (req, res) => {
  try {
    const { channelId } = req.query;
    const userId = req.userId;
    if (!channelId) {
      return errorResponse(res, 400, 'channelId is required');
    }
    // Check channel exists
    const channel = await Channel.findById(channelId).populate('campusId');
    if (!channel) {
      return errorResponse(res, 404, 'Channel not found');
    }
    // Check user is member of campus
    const { campus, isMember } = await getCampusWithMembershipCheck(channel.campusId._id, userId);
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view members');
    }
    // List all campus members
    const members = await User.find({ _id: { $in: campus.members.map(m => m.userId) } }, 'email firstName lastName username avatar');
    return successResponse(res, 200, 'Channel members listed successfully', members, 'members');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get channel members', err.message);
  }
};

// GET /channel/messages?channelId=...&pageNo=...&itemsPerPage=...
const getChannelMessages = async (req, res) => {
  try {
    const { channelId, pageNo, itemsPerPage } = req.query;
    const userId = req.userId;
    if (!channelId) {
      return errorResponse(res, 400, 'channelId is required');
    }
    // Check channel exists
    const channel = await Channel.findById(channelId).populate('campusId');
    if (!channel) {
      return errorResponse(res, 404, 'Channel not found');
    }
    // Check user is member of campus
    const { isMember } = await getCampusWithMembershipCheck(channel.campusId._id, userId);
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to view messages');
    }
    // If pageNo=1, mark user as in this channel and reset unread count
    if (!pageNo || parseInt(pageNo) === 1) {
      socketManager.markInChannel(userId, channelId);
    }
    // Paginate messages, newest first
    const { results: messages, pagination } = await paginateQuery(
      Message,
      { channelId },
      {
        pageNo,
        itemsPerPage,
        sort: { createdAt: -1 },
        populate: { path: 'userId', select: 'email firstName lastName avatar username' }
      }
    );
    // Format messages
    const formatted = messages.map(msg => ({
      _id: msg._id,
      channelId: msg.channelId,
      userId: msg.userId?._id,
      email: msg.userId?.email,
      firstName: msg.userId?.firstName,
      lastName: msg.userId?.lastName,
      username: msg.userId?.username,
      avatar: msg.userId?.avatar,
      text: msg.text,
      mediaUrl: msg.mediaUrl,
      mediaType: msg.mediaType,
      isMe: msg.userId?._id?.toString() === userId,
      createdAt: msg.createdAt
    }));
    return successResponse(res, 200, 'Channel messages retrieved successfully', {
      messages: formatted,
      pagination
    }, 'messagesList');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get channel messages', err.message);
  }
};

// PUT /channel/message/edit
const editMessage = async (req, res) => {
  try {
    const { messageId, text, mediaUrl, mediaType } = req.body;
    const userId = req.userId;

    if (!messageId) {
      return errorResponse(res, 400, 'messageId is required');
    }

    if (!text && !mediaUrl) {
      return errorResponse(res, 400, 'Message must contain text or mediaUrl');
    }

    if (mediaUrl && !mediaType) {
      return errorResponse(res, 400, 'mediaType is required when mediaUrl is provided');
    }

    // Check message exists
    const message = await Message.findById(messageId);
    if (!message) {
      return errorResponse(res, 404, 'Message not found');
    }

    // Check if message belongs to current user (isMe condition)
    if (message.userId.toString() !== userId) {
      return errorResponse(res, 403, 'You can only edit your own messages');
    }

    // Check channel exists and user has access
    const channel = await Channel.findById(message.channelId).populate('campusId');
    if (!channel) {
      return errorResponse(res, 404, 'Channel not found');
    }

    // Check user is member of campus
    const { isMember } = await getCampusWithMembershipCheck(channel.campusId._id, userId);
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to edit messages');
    }

    // Update message
    const updatedMessage = await Message.findByIdAndUpdate(
      messageId,
      {
        text: text || '',
        mediaUrl,
        mediaType
      },
      { new: true }
    ).populate('userId', 'email firstName lastName avatar username');

    // Emit real-time update for message edit
    await socketManager.handleMessageEdit(updatedMessage.toObject(), message.channelId, userId);

    return successResponse(res, 200, 'Message updated successfully', updatedMessage, 'message');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to edit message', err.message);
  }
};

// DELETE /channel/message/delete?messageId=...
const deleteMessage = async (req, res) => {
  try {
    const { messageId } = req.query;
    const userId = req.userId;

    if (!messageId) {
      return errorResponse(res, 400, 'messageId is required');
    }

    // Check message exists
    const message = await Message.findById(messageId);
    if (!message) {
      return errorResponse(res, 404, 'Message not found');
    }

    // Check if message belongs to current user (isMe condition)
    if (message.userId.toString() !== userId) {
      return errorResponse(res, 403, 'You can only delete your own messages');
    }

    // Check channel exists and user has access
    const channel = await Channel.findById(message.channelId).populate('campusId');
    if (!channel) {
      return errorResponse(res, 404, 'Channel not found');
    }

    // Check user is member of campus
    const { isMember } = await getCampusWithMembershipCheck(channel.campusId._id, userId);
    if (!isMember) {
      return errorResponse(res, 403, 'You must be a member of this campus to delete messages');
    }

    // Delete message
    await Message.findByIdAndDelete(messageId);

    // Emit real-time update for message deletion
    await socketManager.handleMessageDelete(messageId, message.channelId, userId);

    return successResponse(res, 200, 'Message deleted successfully', { messageId }, 'deletedMessage');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to delete message', err.message);
  }
};

module.exports = {
  addChannel,
  listChannels,
  sendMessage,
  editMessage,
  deleteMessage,
  getChannelMembers,
  getChannelMessages
}; 