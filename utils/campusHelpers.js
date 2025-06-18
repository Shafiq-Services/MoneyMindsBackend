const Campus = require('../models/campus');

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

module.exports = {
  isUserInCampus,
  getCampusWithMembershipCheck
}; 