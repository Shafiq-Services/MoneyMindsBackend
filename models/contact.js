const mongoose = require('mongoose');

const contactSchema = new mongoose.Schema({
  email: { 
    type: String, 
    required: true 
  },
  phone: { 
    type: String, 
    required: true 
  },
  firstName: { 
    type: String, 
    required: true 
  },
  lastName: { 
    type: String, 
    required: true 
  },
  description: {
    type: String,
    required: true
  },
  fileUrl: { 
    type: String 
  },
  message: {
    type: String,
    default: ''
  }
}, { timestamps: true });

module.exports = mongoose.model('Contact', contactSchema); 