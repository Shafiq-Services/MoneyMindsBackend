const Contact = require('../models/contact');
const { successResponse, errorResponse } = require('../utils/apiResponse');

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