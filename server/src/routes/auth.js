const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { generateToken, refreshToken } = require('../utils/auth');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, handleValidationErrors } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const registerValidation = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one lowercase letter, one uppercase letter, and one number'),
  body('firstName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('First name cannot exceed 50 characters'),
  body('lastName')
    .optional()
    .isLength({ max: 50 })
    .withMessage('Last name cannot exceed 50 characters')
];

const loginValidation = [
  body('email')
    .isEmail()
    .withMessage('Please enter a valid email address')
    .normalizeEmail(),
  body('password')
    .notEmpty()
    .withMessage('Password is required')
];

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
router.post('/register', registerValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { username, email, password, firstName, lastName } = req.body;

  // Check if user already exists
  const emailExists = await User.emailExists(email);
  if (emailExists) {
    return res.status(400).json({ error: 'Email already registered' });
  }

  const usernameExists = await User.usernameExists(username);
  if (usernameExists) {
    return res.status(400).json({ error: 'Username already taken' });
  }

  // Create new user
  const user = new User({
    username,
    email,
    password,
    firstName,
    lastName
  });

  await user.save();

  // Generate token
  const token = generateToken(user);

  logger.info(`New user registered: ${email}`);

  res.status(201).json({
    message: 'User registered successfully',
    token,
    user: user.getPublicProfile()
  });
}));

/**
 * @route   POST /api/auth/login
 * @desc    Login user
 * @access  Public
 */
router.post('/login', loginValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Find user by credentials
  const user = await User.findByCredentials(email, password);

  // Update last login
  user.lastLogin = new Date();
  await user.save();

  // Generate token
  const token = generateToken(user);

  logger.info(`User logged in: ${email}`);

  res.json({
    message: 'Login successful',
    token,
    user: user.getPublicProfile()
  });
}));

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh JWT token
 * @access  Private
 */
router.post('/refresh', authenticate, asyncHandler(async (req, res) => {
  const newToken = refreshToken(req.token);

  logger.info(`Token refreshed for user: ${req.user.email}`);

  res.json({
    message: 'Token refreshed successfully',
    token: newToken
  });
}));

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  res.json({
    user: req.user.getPublicProfile()
  });
}));

/**
 * @route   PUT /api/auth/me
 * @desc    Update current user profile
 * @access  Private
 */
router.put('/me', authenticate, [
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
    .withMessage('Bio cannot exceed 500 characters')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { firstName, lastName, bio } = req.body;

  // Update user
  const user = await User.findById(req.user._id);
  
  if (firstName !== undefined) user.firstName = firstName;
  if (lastName !== undefined) user.lastName = lastName;
  if (bio !== undefined) user.bio = bio;

  await user.save();

  logger.info(`User profile updated: ${user.email}`);

  res.json({
    message: 'Profile updated successfully',
    user: user.getPublicProfile()
  });
}));

/**
 * @route   POST /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
router.post('/change-password', authenticate, [
  body('currentPassword')
    .notEmpty()
    .withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 6 })
    .withMessage('New password must be at least 6 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain at least one lowercase letter, one uppercase letter, and one number')
], handleValidationErrors, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  // Verify current password
  const user = await User.findById(req.user._id).select('+password');
  const isMatch = await user.comparePassword(currentPassword);
  
  if (!isMatch) {
    return res.status(400).json({ error: 'Current password is incorrect' });
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info(`Password changed for user: ${user.email}`);

  res.json({
    message: 'Password changed successfully'
  });
}));

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user (client-side token removal)
 * @access  Private
 */
router.post('/logout', authenticate, asyncHandler(async (req, res) => {
  logger.info(`User logged out: ${req.user.email}`);

  res.json({
    message: 'Logout successful'
  });
}));

module.exports = router; 