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

module.exports = {
  submitContact,
  getAllContacts
}; 