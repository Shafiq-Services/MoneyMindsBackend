const Campus = require('../models/campus');
const Channel = require('../models/channel');
const ChatCategory = require('../models/chat-category');

/**
 * Check if a user is a member of a campus
 * @param {Object} campus - Campus object or campus ID
 * @param {String} userId - User ID to check
 * @returns {Boolean} - True if user is a member
 */
const isUserInCampus = (campus, userId) => {
  if (!campus || !userId) return false;
  
  // If campus is an object with members array
  if (campus.members && Array.isArray(campus.members)) {
    return campus.members.some(member => member.userId.toString() === userId.toString());
  }
  
  return false;
};

/**
 * Get campus by ID and check if user is a member
 * @param {String} campusId - Campus ID
 * @param {String} userId - User ID to check
 * @returns {Object} - { campus, isMember }
 */
const getCampusWithMembershipCheck = async (campusId, userId) => {
  try {
    const campus = await Campus.findById(campusId);
    if (!campus) {
      return { campus: null, isMember: false };
    }
    
    // For Money Minds campus, ALL users are considered members (virtual campus)
    if (campus.isMoneyMindsCampus) {
      return { campus, isMember: true };
    }
    
    // For regular campuses, check actual membership
    const isMember = isUserInCampus(campus, userId);
    return { campus, isMember };
  } catch (error) {
    return { campus: null, isMember: false };
  }
};

/**
 * Ensure Money Minds campus and channel exist (virtual campus - no user joining)
 * @returns {Object} - { campus, channel }
 */
const ensureMoneyMindsCampusExists = async () => {
  try {
    // Find existing Money Minds campus (ID: 68754c79df9d61f7dd467835)
    const moneyMindsCampus = await Campus.findOne({ isMoneyMindsCampus: true });
    
    if (!moneyMindsCampus) {
      console.error('Money Minds campus not found in database');
      return { campus: null, channel: null };
    }
    
    // Find existing Money Minds channel (ID: 6874bab8390e3d32955cfc74)
    const moneyMindsChannel = await Channel.findOne({ 
      name: 'Money Minds',
      campusId: moneyMindsCampus._id
    });
    
    if (!moneyMindsChannel) {
      console.error('Money Minds channel not found in database');
      return { campus: moneyMindsCampus, channel: null };
    }
    
    return { campus: moneyMindsCampus, channel: moneyMindsChannel };
  } catch (error) {
    console.error('Error finding Money Minds campus:', error);
    return { campus: null, channel: null };
  }
};

module.exports = {
  isUserInCampus,
  getCampusWithMembershipCheck,
  ensureMoneyMindsCampusExists
}; 