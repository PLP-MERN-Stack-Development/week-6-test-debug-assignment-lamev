const express = require('express');
const { body, query } = require('express-validator');
const User = require('../models/User');
const Post = require('../models/Post');
const { authenticate, requireAdmin, requireModerator } = require('../middleware/auth');
const { asyncHandler, handleValidationErrors } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const updateUserValidation = [
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters'),
  body('bio')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Bio cannot exceed 500 characters'),
  body('role')
    .optional()
    .isIn(['user', 'moderator', 'admin'])
    .withMessage('Role must be user, moderator, or admin'),
  body('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

const queryValidation = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
  query('role')
    .optional()
    .isIn(['user', 'moderator', 'admin'])
    .withMessage('Role must be user, moderator, or admin'),
  query('isActive')
    .optional()
    .isBoolean()
    .withMessage('isActive must be a boolean')
];

/**
 * @route   GET /api/users
 * @desc    Get all users (admin only)
 * @access  Private (admin)
 */
router.get('/', authenticate, requireAdmin, queryValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    role,
    isActive,
    search,
    sort = '-createdAt'
  } = req.query;

  // Build query
  const query = {};

  if (role) query.role = role;
  if (isActive !== undefined) query.isActive = isActive === 'true';

  // Search functionality
  if (search) {
    query.$or = [
      { username: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } }
    ];
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Execute query
  const users = await User.find(query)
    .select('-password')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await User.countDocuments(query);

  // Calculate pagination info
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logger.info(`Users retrieved by admin: ${users.length} users, page ${page}`);

  res.json({
    users,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalUsers: total,
      hasNextPage,
      hasPrevPage,
      limit: parseInt(limit)
    }
  });
}));

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private (admin or self)
 */
router.get('/:id', authenticate, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id).select('-password');

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if user is requesting their own profile or is admin
  if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to view this profile' });
  }

  res.json({ user });
}));

/**
 * @route   PUT /api/users/:id
 * @desc    Update user (admin or self)
 * @access  Private (admin or self)
 */
router.put('/:id', authenticate, updateUserValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Check if user is updating their own profile or is admin
  if (req.user._id.toString() !== req.params.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to update this profile' });
  }

  // Only admins can change roles
  if (req.body.role && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only admins can change user roles' });
  }

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).select('-password');

  logger.info(`User updated: ${updatedUser.email} by ${req.user.email}`);

  res.json({
    message: 'User updated successfully',
    user: updatedUser
  });
}));

/**
 * @route   DELETE /api/users/:id
 * @desc    Delete user (admin only)
 * @access  Private (admin)
 */
router.delete('/:id', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent admin from deleting themselves
  if (req.user._id.toString() === req.params.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  // Delete user's posts
  await Post.deleteMany({ author: req.params.id });

  // Delete user
  await User.findByIdAndDelete(req.params.id);

  logger.info(`User deleted: ${user.email} by ${req.user.email}`);

  res.json({
    message: 'User deleted successfully'
  });
}));

/**
 * @route   GET /api/users/:id/posts
 * @desc    Get posts by user
 * @access  Public
 */
router.get('/:id/posts', queryValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const { id } = req.params;

  // Verify user exists
  const user = await User.findById(id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const query = { author: id };
  if (status) query.status = status;

  const skip = (page - 1) * limit;

  const posts = await Post.find(query)
    .populate('author', 'username firstName lastName avatar')
    .populate('category', 'name slug color')
    .sort('-createdAt')
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Post.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  res.json({
    posts,
    user: user.getPublicProfile(),
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalPosts: total,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      limit: parseInt(limit)
    }
  });
}));

/**
 * @route   GET /api/users/:id/profile
 * @desc    Get public user profile
 * @access  Public
 */
router.get('/:id/profile', asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id)
    .select('username firstName lastName bio avatar createdAt')
    .populate('postsCount');

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Get user's published posts count
  const publishedPostsCount = await Post.countDocuments({
    author: req.params.id,
    status: 'published',
    isPublished: true
  });

  const profile = {
    ...user.toObject(),
    publishedPostsCount
  };

  res.json({ profile });
}));

/**
 * @route   POST /api/users/:id/deactivate
 * @desc    Deactivate user (admin only)
 * @access  Private (admin)
 */
router.post('/:id/deactivate', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent admin from deactivating themselves
  if (req.user._id.toString() === req.params.id) {
    return res.status(400).json({ error: 'Cannot deactivate your own account' });
  }

  user.isActive = false;
  await user.save();

  logger.info(`User deactivated: ${user.email} by ${req.user.email}`);

  res.json({
    message: 'User deactivated successfully'
  });
}));

/**
 * @route   POST /api/users/:id/activate
 * @desc    Activate user (admin only)
 * @access  Private (admin)
 */
router.post('/:id/activate', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.isActive = true;
  await user.save();

  logger.info(`User activated: ${user.email} by ${req.user.email}`);

  res.json({
    message: 'User activated successfully'
  });
}));

/**
 * @route   POST /api/users/:id/change-role
 * @desc    Change user role (admin only)
 * @access  Private (admin)
 */
router.post('/:id/change-role', authenticate, requireAdmin, [
  body('role')
    .isIn(['user', 'moderator', 'admin'])
    .withMessage('Role must be user, moderator, or admin')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { role } = req.body;
  const user = await User.findById(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Prevent admin from changing their own role
  if (req.user._id.toString() === req.params.id) {
    return res.status(400).json({ error: 'Cannot change your own role' });
  }

  user.role = role;
  await user.save();

  logger.info(`User role changed: ${user.email} to ${role} by ${req.user.email}`);

  res.json({
    message: 'User role changed successfully',
    user: user.getPublicProfile()
  });
}));

/**
 * @route   GET /api/users/stats/overview
 * @desc    Get user statistics (admin only)
 * @access  Private (admin)
 */
router.get('/stats/overview', authenticate, requireAdmin, asyncHandler(async (req, res) => {
  const totalUsers = await User.countDocuments();
  const activeUsers = await User.countDocuments({ isActive: true });
  const inactiveUsers = await User.countDocuments({ isActive: false });
  
  const usersByRole = await User.aggregate([
    {
      $group: {
        _id: '$role',
        count: { $sum: 1 }
      }
    }
  ]);

  const recentUsers = await User.find()
    .sort('-createdAt')
    .limit(5)
    .select('username email createdAt');

  const usersWithPosts = await User.aggregate([
    {
      $lookup: {
        from: 'posts',
        localField: '_id',
        foreignField: 'author',
        as: 'posts'
      }
    },
    {
      $match: {
        'posts.0': { $exists: true }
      }
    },
    {
      $count: 'count'
    }
  ]);

  const stats = {
    totalUsers,
    activeUsers,
    inactiveUsers,
    usersByRole: usersByRole.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {}),
    recentUsers,
    usersWithPosts: usersWithPosts[0]?.count || 0
  };

  res.json({ stats });
}));

module.exports = router; 