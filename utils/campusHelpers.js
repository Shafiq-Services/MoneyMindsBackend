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
    // Find or create Money Minds campus
    let moneyMindsCampus = await Campus.findOne({ isMoneyMindsCampus: true });
    
    if (!moneyMindsCampus) {
      // Create Money Minds campus (virtual campus with no members)
      moneyMindsCampus = await Campus.create({
        slug: 'money-minds',
        title: 'Money Minds',
        imageUrl: '',
        isMoneyMindsCampus: true,
        members: [] // Keep empty for virtual campus
      });
    }
    
    // Create GENERAL category if it doesn't exist
    let generalCategory = await ChatCategory.findOne({ slug: 'GENERAL' });
    if (!generalCategory) {
      generalCategory = await ChatCategory.create({ slug: 'GENERAL' });
    }
    
    // Find or create Money Minds channel in the Money Minds campus
    let moneyMindsChannel = await Channel.findOne({ 
      name: 'Money Minds',
      campusId: moneyMindsCampus._id
    });
    
    if (!moneyMindsChannel) {
      moneyMindsChannel = await Channel.create({
        name: 'Money Minds',
        slug: 'money-minds',
        campusId: moneyMindsCampus._id,
        category: generalCategory._id,
        isPlatformChannel: false
      });
    }
    
    return { campus: moneyMindsCampus, channel: moneyMindsChannel };
  } catch (error) {
    console.error('Error ensuring Money Minds campus exists:', error);
    return { campus: null, channel: null };
  }
};

module.exports = {
  isUserInCampus,
  getCampusWithMembershipCheck,
  ensureMoneyMindsCampusExists
}; 