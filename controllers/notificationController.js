const Notification = require('../models/notification');
const UserNotificationRead = require('../models/userNotificationRead');
const User = require('../models/user');
const mongoose = require('mongoose');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const socketManager = require('../utils/socketManager');

// GET /notification/list?category=...&isRead=...
const getUserNotifications = async (req, res) => {
  try {
    const { category, isRead } = req.query;
    const userId = req.userId;

    // Build filter for user-specific notifications and broadcast notifications
    const filter = {
      $or: [
        { userId: userId }, // User-specific notifications
        { isBroadcastToAll: true } // Broadcast notifications to all users
      ]
    };
    
    if (category) {
      filter.category = category;
    }

    // Get all notifications, newest first
    let notifications = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .populate([
        { path: 'campusId', select: 'title slug imageUrl' },
        { path: 'relatedEntityId', select: 'title name slug' },
        { path: 'sentByAdminId', select: 'firstName lastName' }
      ])
      .lean();

    // Get read status for broadcast notifications
    if (notifications.length > 0) {
      const broadcastNotificationIds = notifications
        .filter(n => n.isBroadcastToAll)
        .map(n => n._id);

      if (broadcastNotificationIds.length > 0) {
        const readBroadcasts = await UserNotificationRead.find({
          userId: userId,
          notificationId: { $in: broadcastNotificationIds }
        }).select('notificationId readAt');

        const readBroadcastMap = readBroadcasts.reduce((map, read) => {
          map[read.notificationId.toString()] = read.readAt;
          return map;
        }, {});

        // Add read status to broadcast notifications
        notifications = notifications.map(notification => {
          if (notification.isBroadcastToAll) {
            const readAt = readBroadcastMap[notification._id.toString()];
            return {
              ...notification,
              isRead: !!readAt,
              readAt: readAt || null
            };
          }
          return notification;
        });
      }
    }

    // Filter by read status if specified
    if (isRead !== undefined) {
      const isReadBool = isRead === 'true';
      notifications = notifications.filter(n => n.isRead === isReadBool);
    }

    return successResponse(res, 200, 'Notifications retrieved successfully', {
      notifications,
      total: notifications.length
    }, 'notificationsList');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get notifications', err.message);
  }
};

// GET /notification/categories
const getNotificationCategories = async (req, res) => {
  try {
    const categories = [
      { value: 'campus-release', label: 'Campus Releases' },
      { value: 'film-release', label: 'Film Releases' },
      { value: 'series-release', label: 'Series Releases' },
      { value: 'book-release', label: 'Book Releases' },
      { value: 'course-release', label: 'Course Releases' },
      { value: 'lesson-release', label: 'Lesson Releases' },
      { value: 'subscription-warning', label: 'Subscription Warnings' },
      { value: 'admin-broadcast', label: 'Admin Announcements' },
      { value: 'general', label: 'General' }
    ];

    return successResponse(res, 200, 'Notification categories retrieved successfully', categories, 'categories');
  } catch (err) {
    return errorResponse(res, 500, 'Failed to get notification categories', err.message);
  }
};

// POST /admin/notification/send
const sendAdminNotification = async (req, res) => {
  try {
    const { title, message, type = 'info', icon = '📢' } = req.body;
    const adminId = req.userId;

    // Validate required fields
    if (!title || !message) {
      return errorResponse(res, 400, 'Title and message are required');
    }

    // Validate type
    const validTypes = ['success', 'warning', 'error', 'info'];
    if (!validTypes.includes(type)) {
      return errorResponse(res, 400, 'Invalid notification type');
    }

    // Get total active users count
    const totalUsers = await User.countDocuments({ isActive: { $ne: false } });

    if (totalUsers === 0) {
      return errorResponse(res, 404, 'No active users found');
    }

    // Create notification data for socket broadcast
    const notificationData = {
      title,
      message,
      type,
      icon,
      notification: { title, message, type, icon }
    };

    // Create ONE notification record for the broadcast
    const broadcastNotification = await Notification.create({
      title,
      message,
      type,
      icon,
      category: 'admin-broadcast',
      isAdminSent: true,
      isBroadcastToAll: true,
      sentByAdminId: adminId,
      totalRecipients: totalUsers,
      eventName: 'admin-notification-broadcast',
      data: notificationData
    });

    // Broadcast via socket to all users
    await socketManager.broadcastGlobalNotification('admin-notification-broadcast', notificationData);

    return successResponse(res, 200, 'Admin notification sent successfully', {
      notificationId: broadcastNotification._id,
      sentToUsers: totalUsers,
      notification: { title, message, type, icon }
    }, 'adminNotificationSent');

  } catch (err) {
    return errorResponse(res, 500, 'Failed to send admin notification', err.message);
  }
};

// GET /admin/notification/history
const getAdminNotificationHistory = async (req, res) => {
  try {
    const adminId = req.userId;

    // Get admin broadcast notifications (much simpler now!)
    const adminNotifications = await Notification.find({
      isAdminSent: true,
      isBroadcastToAll: true,
      sentByAdminId: adminId
    })
    .sort({ createdAt: -1 })
    .populate('sentByAdminId', 'firstName lastName email')
    .select('title message type icon createdAt totalRecipients sentByAdminId');

    return successResponse(res, 200, 'Admin notification history retrieved successfully', {
      notifications: adminNotifications,
      total: adminNotifications.length
    }, 'adminNotificationHistory');

  } catch (err) {
    return errorResponse(res, 500, 'Failed to get admin notification history', err.message);
  }
};

module.exports = {
  getUserNotifications,
  getNotificationCategories,
  sendAdminNotification,
  getAdminNotificationHistory
}; 