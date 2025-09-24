const Contact = require('../models/contact');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const sendEmail = require('../utils/sendEmail');

/**
 * @description Submit Contact Form
 * @route POST /api/contact/submit
 * @access Public
 */
const submitContact = async (req, res) => {
  const { email, phone, firstName, lastName, description, fileUrl, message } = req.body;

  // Validate required fields
  if (!email || !phone || !firstName || !lastName || !description) {
    return errorResponse(res, 400, 'Email, phone, firstName, lastName, and description are required');
  }

  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return errorResponse(res, 400, 'Please provide a valid email address');
  }

  try {
    const contact = await Contact.create({
      email,
      phone,
      firstName,
      lastName,
      description,
      fileUrl,
      message: message || ''
    });

    // Send confirmation email to user
    try {
      await sendEmail(
        email,
        'Contact Form Submitted - Money Minds',
        `Hello ${firstName},\n\nThank you for contacting Money Minds!\n\nWe have received your message and will get back to you as soon as possible.\n\nYour message details:\n• Subject: ${description}\n• Message: ${message || 'No additional message provided'}\n\nIf you have any urgent questions, please don't hesitate to reach out to our support team.\n\nBest regards,\nThe Money Minds Team`
      );
    } catch (emailError) {
      console.error('Failed to send contact confirmation email:', emailError);
    }

    // Send notification email to admin (you can customize the admin email)
    // const adminEmail = process.env.ADMIN_EMAIL || 'admin@moneymindsportal.com';
    // try {
    //   await sendEmail(
    //     adminEmail,
    //     'New Contact Form Submission - Money Minds',
    //     `A new contact form has been submitted:\n\n• Name: ${firstName} ${lastName}\n• Email: ${email}\n• Phone: ${phone}\n• Subject: ${description}\n• Message: ${message || 'No additional message provided'}\n• File URL: ${fileUrl || 'No file attached'}\n• Submitted: ${new Date().toLocaleString()}\n\nPlease respond to this inquiry as soon as possible.`
    //   );
    // } catch (adminEmailError) {
    //   console.error('Failed to send admin notification email:', adminEmailError);
    // }

    // Structure response according to node-api-structure
    const responseData = {
      _id: contact._id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      description: contact.description,
      fileUrl: contact.fileUrl,
      message: contact.message,
      createdAt: contact.createdAt
    };

    return successResponse(res, 201, 'Contact form submitted successfully', responseData, 'contact');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to submit contact form', error.message);
  }
};

/**
 * @description Get All Contact Messages (Admin Only)
 * @route GET /api/contact/list
 * @access Private (Admin)
 */
const getAllContacts = async (req, res) => {
  try {
    const contacts = await Contact.find({})
      .sort({ createdAt: -1 })
      .lean();

    // Structure response according to node-api-structure
    const responseData = contacts.map(contact => ({
      _id: contact._id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      description: contact.description,
      fileUrl: contact.fileUrl,
      message: contact.message,
      createdAt: contact.createdAt
    }));

    return successResponse(res, 200, 'Contact messages retrieved successfully', responseData, 'contacts');
  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve contact messages', error.message);
  }
};

/**
 * Update contact status
 * @route PUT /api/admin/contact/status
 * @access Admin
 */
const updateContactStatus = async (req, res) => {
  try {
    const { contactId } = req.query;
    const { status } = req.body;

    if (!contactId) {
      return errorResponse(res, 400, 'Contact ID is required');
    }

    if (!status || !['unread', 'viewed', 'responded'].includes(status)) {
      return errorResponse(res, 400, 'Valid status is required (unread, viewed, responded)');
    }

    const updateData = { status };
    if (status === 'viewed') {
      updateData.readAt = new Date();
    }

    const contact = await Contact.findByIdAndUpdate(
      contactId,
      updateData,
      { new: true }
    ).lean();

    if (!contact) {
      return errorResponse(res, 404, 'Contact not found');
    }

    const responseData = {
      _id: contact._id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      description: contact.description,
      message: contact.message,
      status: contact.status,
      readAt: contact.readAt,
      createdAt: contact.createdAt
    };

    return successResponse(res, 200, 'Contact status updated successfully', responseData, 'contactStatusUpdated');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to update contact status', error.message);
  }
};

/**
 * Reply to contact
 * @route POST /api/admin/contact/reply
 * @access Admin
 */
const replyToContact = async (req, res) => {
  try {
    const { contactId } = req.query;
    const { reply } = req.body;
    const adminId = req.userId;

    if (!contactId) {
      return errorResponse(res, 400, 'Contact ID is required');
    }

    if (!reply) {
      return errorResponse(res, 400, 'Reply message is required');
    }

    const contact = await Contact.findById(contactId);
    if (!contact) {
      return errorResponse(res, 404, 'Contact not found');
    }

    // Update contact with admin reply
    const updatedContact = await Contact.findByIdAndUpdate(
      contactId,
      {
        status: 'responded',
        adminReply: reply,
        respondedAt: new Date(),
        respondedByAdminId: adminId,
        readAt: contact.readAt || new Date()
      },
      { new: true }
    ).populate('respondedByAdminId', 'firstName lastName email').lean();

    // Send reply email to user
    try {
      await sendEmail(
        contact.email,
        `Re: ${contact.description}`,
        `Hello ${contact.firstName},\n\nThank you for contacting Money Minds. We have reviewed your inquiry and here is our response:\n\n${reply}\n\nIf you have any further questions, please don't hesitate to reach out to us.\n\nBest regards,\nThe Money Minds Team`
      );
    } catch (emailError) {
      console.error('Failed to send reply email:', emailError);
      // Don't fail the API call if email fails
    }

    const responseData = {
      _id: updatedContact._id,
      email: updatedContact.email,
      phone: updatedContact.phone,
      firstName: updatedContact.firstName,
      lastName: updatedContact.lastName,
      description: updatedContact.description,
      message: updatedContact.message,
      status: updatedContact.status,
      adminReply: updatedContact.adminReply,
      readAt: updatedContact.readAt,
      respondedAt: updatedContact.respondedAt,
      respondedByAdmin: updatedContact.respondedByAdminId ? {
        name: `${updatedContact.respondedByAdminId.firstName} ${updatedContact.respondedByAdminId.lastName}`,
        email: updatedContact.respondedByAdminId.email
      } : null,
      createdAt: updatedContact.createdAt
    };

    return successResponse(res, 200, 'Reply sent successfully', responseData, 'contactReplySent');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to send reply', error.message);
  }
};

/**
 * Get contact details
 * @route GET /api/admin/contact/get
 * @access Admin
 */
const getContactById = async (req, res) => {
  try {
    const { contactId } = req.query;

    if (!contactId) {
      return errorResponse(res, 400, 'Contact ID is required');
    }

    const contact = await Contact.findById(contactId)
      .populate('respondedByAdminId', 'firstName lastName email')
      .lean();

    if (!contact) {
      return errorResponse(res, 404, 'Contact not found');
    }

    const responseData = {
      _id: contact._id,
      email: contact.email,
      phone: contact.phone,
      firstName: contact.firstName,
      lastName: contact.lastName,
      description: contact.description,
      fileUrl: contact.fileUrl,
      message: contact.message,
      status: contact.status,
      adminReply: contact.adminReply,
      readAt: contact.readAt,
      respondedAt: contact.respondedAt,
      respondedByAdmin: contact.respondedByAdminId ? {
        name: `${contact.respondedByAdminId.firstName} ${contact.respondedByAdminId.lastName}`,
        email: contact.respondedByAdminId.email
      } : null,
      createdAt: contact.createdAt
    };

    return successResponse(res, 200, 'Contact details retrieved successfully', responseData, 'contactDetails');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve contact details', error.message);
  }
};

/**
 * Get contact statistics
 * @route GET /api/admin/contact/stats
 * @access Admin
 */
const getContactStats = async (req, res) => {
  try {
    const totalContacts = await Contact.countDocuments();
    const unreadContacts = await Contact.countDocuments({ status: 'unread' });
    const viewedContacts = await Contact.countDocuments({ status: 'viewed' });
    const respondedContacts = await Contact.countDocuments({ status: 'responded' });

    // Get recent contacts (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentContacts = await Contact.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo } 
    });

    // Get response rate
    const responseRate = totalContacts > 0 ? 
      ((respondedContacts / totalContacts) * 100).toFixed(2) : 0;

    const responseData = {
      overview: {
        totalContacts,
        unreadContacts,
        viewedContacts,
        respondedContacts,
        recentContacts,
        responseRate: parseFloat(responseRate)
      },
      breakdown: {
        pendingResponse: unreadContacts + viewedContacts,
        completedResponses: respondedContacts
      }
    };

    return successResponse(res, 200, 'Contact statistics retrieved successfully', responseData, 'contactStats');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve contact statistics', error.message);
  }
};

module.exports = {
  submitContact,
  getAllContacts,
  updateContactStatus,
  replyToContact,
  getContactById,
  getContactStats
}; 