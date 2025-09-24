const User = require('../models/user');
const Subscription = require('../models/subscription');
const { successResponse, errorResponse } = require('../utils/apiResponse');
const { parsePaginationParams } = require('../utils/paginationHelper');
const bcrypt = require('bcrypt');
const { convertToFullUrl } = require('../utils/urlHelper');

/**
 * Get all users with pagination and filtering
 * @route GET /api/admin/user/list
 * @access Admin
 */
const getAllUsers = async (req, res) => {
  try {
    const { page, limit, skip } = parsePaginationParams(req.query.page, req.query.limit);
    const { search, role, status, plan } = req.query;

    // Build filter object
    const filter = {};
    if (role) filter.role = role;
    if (status) filter.status = status;
    if (plan) filter.plan = plan;
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }

    const users = await User.find(filter)
      .select('-password') // Exclude password field
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(skip)
      .lean();

    const totalUsers = await User.countDocuments(filter);

    // Get subscription info for each user
    const userIds = users.map(user => user._id);
    const subscriptions = await Subscription.find({ 
      userId: { $in: userIds },
      status: { $in: ['active', 'past_due', 'incomplete'] }
    }).lean();

    const subscriptionMap = {};
    subscriptions.forEach(sub => {
      subscriptionMap[sub.userId.toString()] = sub;
    });

    const responseData = users.map(user => {
      const subscription = subscriptionMap[user._id.toString()];
      return {
        _id: user._id,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        username: user.username,
        phone: user.phone,
        role: user.role,
        status: user.status,
        isActive: user.isActive,
        plan: subscription ? subscription.plan : user.plan,
        subscriptionStatus: subscription ? subscription.status : 'none',
        emailVerified: user.emailVerified,
        profileCompleted: user.profileCompleted,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt
      };
    });

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
 * Get single user details
 * @route GET /api/admin/user/get
 * @access Admin
 */
const getUserById = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return errorResponse(res, 400, 'User ID is required');
    }

    const user = await User.findById(userId)
      .select('-password')
      .lean();

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Get user's subscription info
    const subscription = await Subscription.findOne({
      userId: userId,
      status: { $in: ['active', 'past_due', 'incomplete', 'canceled'] }
    }).sort({ createdAt: -1 }).lean();

    const responseData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      phone: user.phone,
      avatar: convertToFullUrl(user.avatar),
      bio: user.bio,
      country: user.country,
      role: user.role,
      status: user.status,
      isActive: user.isActive,
      plan: user.plan,
      stripeCustomerId: user.stripeCustomerId,
      emailVerified: user.emailVerified,
      profileCompleted: user.profileCompleted,
      lastLoginAt: user.lastLoginAt,
      subscription: subscription ? {
        _id: subscription._id,
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        createdAt: subscription.createdAt
      } : null,
      createdAt: user.createdAt
    };

    return successResponse(res, 200, 'User details retrieved successfully', responseData, 'userDetails');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve user details', error.message);
  }
};

/**
 * Create new user
 * @route POST /api/admin/user/add
 * @access Admin
 */
const createUser = async (req, res) => {
  try {
    const { 
      firstName, 
      lastName, 
      email, 
      phone, 
      username, 
      role = 'user',
      status = 'active',
      plan = 'monthly',
      password 
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email) {
      return errorResponse(res, 400, 'First name, last name, and email are required');
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return errorResponse(res, 400, 'Email already exists');
    }

    // Check if username already exists (if provided)
    if (username) {
      const existingUsername = await User.findOne({ username });
      if (existingUsername) {
        return errorResponse(res, 400, 'Username already exists');
      }
    }

    // Hash password if provided (for admin users)
    let hashedPassword;
    if (password && (role === 'admin' || role === 'moderator')) {
      hashedPassword = await bcrypt.hash(password, 12);
    }

    const userData = {
      firstName,
      lastName,
      email,
      phone,
      username,
      role,
      status,
      plan,
      emailVerified: true, // Admin created users are pre-verified
      profileCompleted: true,
      isActive: status === 'active'
    };

    if (hashedPassword) {
      userData.password = hashedPassword;
    }

    const user = await User.create(userData);

    const responseData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      username: user.username,
      phone: user.phone,
      role: user.role,
      status: user.status,
      plan: user.plan,
      createdAt: user.createdAt
    };

    return successResponse(res, 201, 'User created successfully', responseData, 'userCreated');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to create user', error.message);
  }
};

/**
 * Update user details
 * @route PUT /api/admin/user/edit
 * @access Admin
 */
const updateUser = async (req, res) => {
  try {
    const { userId } = req.query;
    const { 
      firstName, 
      lastName, 
      phone, 
      username, 
      bio, 
      country,
      role,
      status,
      plan,
      password 
    } = req.body;

    if (!userId) {
      return errorResponse(res, 400, 'User ID is required');
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Check if username already exists (if being changed)
    if (username && username !== user.username) {
      const existingUsername = await User.findOne({ 
        username, 
        _id: { $ne: userId } 
      });
      if (existingUsername) {
        return errorResponse(res, 400, 'Username already exists');
      }
    }

    // Prepare update data
    const updateData = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (phone !== undefined) updateData.phone = phone;
    if (username !== undefined) updateData.username = username;
    if (bio !== undefined) updateData.bio = bio;
    if (country !== undefined) updateData.country = country;
    if (role !== undefined) updateData.role = role;
    if (status !== undefined) {
      updateData.status = status;
      updateData.isActive = status === 'active';
    }
    if (plan !== undefined) updateData.plan = plan;

    // Hash password if provided
    if (password) {
      updateData.password = await bcrypt.hash(password, 12);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, select: '-password' }
    ).lean();

    const responseData = {
      _id: updatedUser._id,
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      username: updatedUser.username,
      phone: updatedUser.phone,
      role: updatedUser.role,
      status: updatedUser.status,
      isActive: updatedUser.isActive,
      plan: updatedUser.plan,
      createdAt: updatedUser.createdAt
    };

    return successResponse(res, 200, 'User updated successfully', responseData, 'userUpdated');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to update user', error.message);
  }
};

/**
 * Delete user (soft delete)
 * @route DELETE /api/admin/user/delete
 * @access Admin
 */
const deleteUser = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return errorResponse(res, 400, 'User ID is required');
    }

    const user = await User.findById(userId);
    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    // Prevent deleting admin users
    if (user.role === 'admin') {
      return errorResponse(res, 403, 'Cannot delete admin users');
    }

    // Soft delete by setting status to inactive
    await User.findByIdAndUpdate(userId, { 
      isActive: false, 
      status: 'inactive' 
    });

    return successResponse(res, 200, 'User deleted successfully');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to delete user', error.message);
  }
};

/**
 * Update user status
 * @route PUT /api/admin/user/status
 * @access Admin
 */
const updateUserStatus = async (req, res) => {
  try {
    const { userId } = req.query;
    const { status } = req.body;

    if (!userId || !status) {
      return errorResponse(res, 400, 'User ID and status are required');
    }

    const validStatuses = ['active', 'inactive', 'banned', 'waitlist', 'card_declined'];
    if (!validStatuses.includes(status)) {
      return errorResponse(res, 400, 'Invalid status');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { 
        status,
        isActive: status === 'active'
      },
      { new: true, select: '-password' }
    ).lean();

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const responseData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      status: user.status,
      isActive: user.isActive
    };

    return successResponse(res, 200, 'User status updated successfully', responseData, 'userStatusUpdated');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to update user status', error.message);
  }
};

/**
 * Update user role
 * @route PUT /api/admin/user/role
 * @access Admin
 */
const updateUserRole = async (req, res) => {
  try {
    const { userId } = req.query;
    const { role } = req.body;

    if (!userId || !role) {
      return errorResponse(res, 400, 'User ID and role are required');
    }

    const validRoles = ['user', 'admin', 'moderator'];
    if (!validRoles.includes(role)) {
      return errorResponse(res, 400, 'Invalid role');
    }

    const user = await User.findByIdAndUpdate(
      userId,
      { role },
      { new: true, select: '-password' }
    ).lean();

    if (!user) {
      return errorResponse(res, 404, 'User not found');
    }

    const responseData = {
      _id: user._id,
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      role: user.role
    };

    return successResponse(res, 200, 'User role updated successfully', responseData, 'userRoleUpdated');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to update user role', error.message);
  }
};

/**
 * Get user statistics
 * @route GET /api/admin/user/stats
 * @access Admin
 */
const getUserStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const inactiveUsers = await User.countDocuments({ status: 'inactive' });
    const bannedUsers = await User.countDocuments({ status: 'banned' });
    
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const moderatorUsers = await User.countDocuments({ role: 'moderator' });
    const regularUsers = await User.countDocuments({ role: 'user' });

    // Get recent registrations (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const recentRegistrations = await User.countDocuments({ 
      createdAt: { $gte: sevenDaysAgo } 
    });

    // Get subscription stats
    const activeSubscriptions = await Subscription.countDocuments({ status: 'active' });
    const monthlyPlans = await User.countDocuments({ plan: 'monthly' });
    const yearlyPlans = await User.countDocuments({ plan: 'yearly' });

    const responseData = {
      overview: {
        totalUsers,
        activeUsers,
        inactiveUsers,
        bannedUsers,
        recentRegistrations,
        activeSubscriptions
      },
      byRole: {
        adminUsers,
        moderatorUsers,
        regularUsers
      },
      byPlan: {
        monthlyPlans,
        yearlyPlans
      },
      growth: {
        newUsersThisWeek: recentRegistrations,
        growthRate: totalUsers > 0 ? ((recentRegistrations / totalUsers) * 100).toFixed(2) : 0
      }
    };

    return successResponse(res, 200, 'User statistics retrieved successfully', responseData, 'userStats');

  } catch (error) {
    return errorResponse(res, 500, 'Failed to retrieve user statistics', error.message);
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  updateUserStatus,
  updateUserRole,
  getUserStats
};
