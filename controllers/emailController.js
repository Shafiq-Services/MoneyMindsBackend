const Email = require('../models/email');
const User = require('../models/user');
const sendEmail = require('../utils/sendEmail');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { parsePaginationParams } = require('../utils/paginationHelper');

/**
 * Get all sent emails with pagination
 * @route GET /api/admin/email/list
 * @access Admin
 */
const getAllEmails = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query.page, req.query.limit);
    const { status, campaignType } = req.query;

    // Build filter object
    const filter = {};
    if (status) filter.status = status;
    if (campaignType) filter.campaignType = campaignType;

    const emails = await Email.find(filter)
      .populate('sentByAdminId', 'firstName lastName email')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const totalEmails = await Email.countDocuments(filter);

    const responseData = emails.map(email => ({
      _id: email._id,
      subject: email.subject,
      totalRecipients: email.totalRecipients,
      totalSent: email.totalSent,
      totalDelivered: email.totalDelivered,
      totalOpened: email.totalOpened,
      openRate: email.openRate,
      deliveryRate: email.deliveryRate,
      status: email.status,
      campaignType: email.campaignType,
      sentByAdmin: email.sentByAdminId ? {
        name: `${email.sentByAdminId.firstName} ${email.sentByAdminId.lastName}`,
        email: email.sentByAdminId.email
      } : null,
      sentAt: email.sentAt,
      createdAt: email.createdAt
    }));

    return successResponse(res, 200, 'Emails retrieved successfully', {
      emails: responseData,
      pagination: {
        page,
        limit,
        total: totalEmails,
        pages: Math.ceil(totalEmails / limit)
      }
    }, 'emailList');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve emails', error.message);
  }
};

/**
 * Get email details with recipients
 * @route GET /api/admin/email/get
 * @access Admin
 */
const getEmailById = async (req, res) => {
  try {
    const { emailId } = req.query;

    if (!emailId) {
      return errorResponse(res, 400, 'Email ID is required');
    }

    const email = await Email.findById(emailId)
      .populate('sentByAdminId', 'firstName lastName email')
      .populate('recipients.userId', 'firstName lastName email username')
      .lean();

    if (!email) {
      return errorResponse(res, 404, 'Email not found');
    }

    const responseData = {
      _id: email._id,
      subject: email.subject,
      content: email.content,
      htmlContent: email.htmlContent,
      totalRecipients: email.totalRecipients,
      totalSent: email.totalSent,
      totalDelivered: email.totalDelivered,
      totalOpened: email.totalOpened,
      totalBounced: email.totalBounced,
      totalFailed: email.totalFailed,
      openRate: email.openRate,
      deliveryRate: email.deliveryRate,
      status: email.status,
      campaignType: email.campaignType,
      sentByAdmin: email.sentByAdminId ? {
        name: `${email.sentByAdminId.firstName} ${email.sentByAdminId.lastName}`,
        email: email.sentByAdminId.email
      } : null,
      recipients: email.recipients.map(recipient => ({
        _id: recipient._id,
        user: recipient.userId ? {
          name: `${recipient.userId.firstName} ${recipient.userId.lastName}`,
          email: recipient.userId.email,
          username: recipient.userId.username
        } : null,
        email: recipient.email,
        status: recipient.status,
        sentAt: recipient.sentAt,
        deliveredAt: recipient.deliveredAt,
        openedAt: recipient.openedAt,
        isOpened: recipient.isOpened
      })),
      sentAt: email.sentAt,
      completedAt: email.completedAt,
      createdAt: email.createdAt
    };

    return successResponse(res, 200, 'Email details retrieved successfully', responseData, 'emailDetails');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve email details', error.message);
  }
};

/**
 * Send bulk email to selected users
 * @route POST /api/admin/email/send
 * @access Admin
 */
const sendBulkEmail = async (req, res) => {
  try {
    const adminId = req.userId;
    const { subject, content, userIds, campaignType = 'broadcast' } = req.body;

    // Validation
    if (!subject || !content) {
      return errorResponse(res, 400, 'Subject and content are required');
    }

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return errorResponse(res, 400, 'At least one user must be selected');
    }

    // Get selected users
    const users = await User.find({ 
      _id: { $in: userIds }, 
      isActive: true 
    }).lean();

    if (users.length === 0) {
      return errorResponse(res, 404, 'No active users found');
    }

    // Convert plain text to HTML
    const htmlContent = content.replace(/\n/g, '<br>');

    // Create email record
    const emailRecord = new Email({
      subject,
      content,
      htmlContent,
      sentByAdminId: adminId,
      campaignType,
      totalRecipients: users.length,
      status: 'sending'
    });

    // Prepare recipients array
    const recipients = users.map(user => ({
      userId: user._id,
      email: user.email,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email,
      status: 'sent',
      sentAt: new Date()
    }));

    emailRecord.recipients = recipients;
    await emailRecord.save();

    // Send emails in background (don't await to avoid timeout)
    setImmediate(async () => {
      let successCount = 0;
      let failureCount = 0;

      for (const user of users) {
        try {
          const userName = `${user.firstName || ''} ${user.lastName || ''}`.trim() || user.email.split('@')[0];
          
          await sendEmail(
            user.email,
            subject,
            `Hello ${userName},\n\n${content}\n\nBest regards,\nThe Money Minds Team`
          );

          successCount++;
          
          // Update recipient status
          await Email.updateOne(
            { _id: emailRecord._id, 'recipients.userId': user._id },
            { 
              $set: { 
                'recipients.$.status': 'delivered',
                'recipients.$.deliveredAt': new Date()
              }
            }
          );

        } catch (emailError) {
          console.error(`Failed to send email to ${user.email}:`, emailError.message);
          failureCount++;

          // Update recipient status
          await Email.updateOne(
            { _id: emailRecord._id, 'recipients.userId': user._id },
            { $set: { 'recipients.$.status': 'failed' } }
          );
        }
      }

      // Update email record with final stats
      const deliveryRate = users.length > 0 ? ((successCount / users.length) * 100).toFixed(2) : 0;
      
      await Email.findByIdAndUpdate(emailRecord._id, {
        status: failureCount === 0 ? 'sent' : 'sent', // Mark as sent even with some failures
        totalSent: successCount,
        totalDelivered: successCount,
        totalFailed: failureCount,
        deliveryRate: parseFloat(deliveryRate),
        sentAt: new Date(),
        completedAt: new Date()
      });

      console.log(`✅ Bulk email completed: ${successCount} sent, ${failureCount} failed`);
    });

    return successResponse(res, 200, 'Email sending initiated successfully', {
      emailId: emailRecord._id,
      totalRecipients: users.length,
      status: 'sending'
    }, 'emailSent');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to send bulk email', error.message);
  }
};

/**
 * Get users list for email selection
 * @route GET /api/admin/users/list
 * @access Admin
 */
const getUsersForEmail = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query.page, req.query.limit);
    const { search, role, status } = req.query;

    // Build filter object
    const filter = { isActive: true };
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('firstName lastName email username role status plan createdAt')
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const totalUsers = await User.countDocuments(filter);

    const responseData = users.map(user => ({
      _id: user._id,
      name: `${user.firstName || ''} ${user.lastName || ''}`.trim() || 'Unknown',
      email: user.email,
      username: user.username,
      role: user.role,
      status: user.status,
      plan: user.plan,
      createdAt: user.createdAt
    }));

    return successResponse(res, 200, 'Users retrieved successfully', {
      users: responseData,
      pagination: {
        page,
        limit,
        total: totalUsers,
        pages: Math.ceil(totalUsers / limit)
      }
    }, 'usersList');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve users', error.message);
  }
};

/**
 * Get email statistics
 * @route GET /api/admin/email/stats
 * @access Admin
 */
const getEmailStats = async (req, res) => {
  try {
    const totalEmails = await Email.countDocuments();
    const sentEmails = await Email.countDocuments({ status: 'sent' });
    const sendingEmails = await Email.countDocuments({ status: 'sending' });
    const failedEmails = await Email.countDocuments({ status: 'failed' });

    // Calculate aggregate stats
    const aggregateStats = await Email.aggregate([
      { $match: { status: 'sent' } },
      {
        $group: {
          _id: null,
          totalRecipients: { $sum: '$totalRecipients' },
          totalSent: { $sum: '$totalSent' },
          totalDelivered: { $sum: '$totalDelivered' },
          totalOpened: { $sum: '$totalOpened' },
          totalFailed: { $sum: '$totalFailed' }
        }
      }
    ]);

    const stats = aggregateStats[0] || {
      totalRecipients: 0,
      totalSent: 0,
      totalDelivered: 0,
      totalOpened: 0,
      totalFailed: 0
    };

    // Calculate rates
    const deliveryRate = stats.totalSent > 0 ? 
      ((stats.totalDelivered / stats.totalSent) * 100).toFixed(2) : 0;
    const openRate = stats.totalDelivered > 0 ? 
      ((stats.totalOpened / stats.totalDelivered) * 100).toFixed(2) : 0;

    // Get recent emails
    const recentEmails = await Email.find()
      .populate('sentByAdminId', 'firstName lastName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('subject totalRecipients totalSent openRate status sentAt createdAt')
      .lean();

    const responseData = {
      overview: {
        totalEmails,
        sentEmails,
        sendingEmails,
        failedEmails,
        totalRecipients: stats.totalRecipients,
        totalSent: stats.totalSent,
        totalDelivered: stats.totalDelivered,
        totalOpened: stats.totalOpened,
        totalFailed: stats.totalFailed,
        deliveryRate: parseFloat(deliveryRate),
        openRate: parseFloat(openRate)
      },
      recentEmails: recentEmails.map(email => ({
        _id: email._id,
        subject: email.subject,
        totalRecipients: email.totalRecipients,
        totalSent: email.totalSent,
        openRate: email.openRate,
        status: email.status,
        sentByAdmin: email.sentByAdminId ? 
          `${email.sentByAdminId.firstName} ${email.sentByAdminId.lastName}` : 'Unknown',
        sentAt: email.sentAt,
        createdAt: email.createdAt
      }))
    };

    return successResponse(res, 200, 'Email statistics retrieved successfully', responseData, 'emailStats');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve email statistics', error.message);
  }
};

module.exports = {
  getAllEmails,
  getEmailById,
  sendBulkEmail,
  getUsersForEmail,
  getEmailStats
};
