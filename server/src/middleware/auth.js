const User = require('../models/User');
const { verifyToken, extractTokenFromHeader } = require('../utils/auth');
const { logger } = require('../utils/logger');

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request object
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    const token = extractTokenFromHeader(authHeader);

    // Verify token
    const decoded = verifyToken(token);

    // Find user
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'User account is deactivated' });
    }

    // Attach user to request
    req.user = user;
    req.token = token;

    logger.debug(`User authenticated: ${user.email}`);
    next();
  } catch (error) {
    logger.error('Authentication failed:', error.message);
    res.status(401).json({ error: 'Authentication failed' });
  }
};

/**
 * Optional authentication middleware
 * Similar to authenticate but doesn't fail if no token provided
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return next();
    }

    const token = extractTokenFromHeader(authHeader);
    const decoded = verifyToken(token);
    const user = await User.findById(decoded.id).select('-password');
    
    if (user && user.isActive) {
      req.user = user;
      req.token = token;
      logger.debug(`Optional authentication successful: ${user.email}`);
    }
    
    next();
  } catch (error) {
    logger.debug('Optional authentication failed:', error.message);
    next();
  }
};

/**
 * Role-based authorization middleware
 * @param {String|Array} roles - Required role(s)
 */
const authorize = (roles = []) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Convert single role to array
    const requiredRoles = Array.isArray(roles) ? roles : [roles];

    // Check if user has required role
    if (!requiredRoles.includes(req.user.role)) {
      logger.warn(`Access denied for user ${req.user.email}. Required roles: ${requiredRoles.join(', ')}. User role: ${req.user.role}`);
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    logger.debug(`Authorization successful for user ${req.user.email} with role ${req.user.role}`);
    next();
  };
};

/**
 * Admin authorization middleware
 */
const requireAdmin = authorize('admin');

/**
 * Moderator or admin authorization middleware
 */
const requireModerator = authorize(['admin', 'moderator']);

/**
 * Self or admin authorization middleware
 * Allows users to access their own resources or admins to access any resource
 */
const requireSelfOrAdmin = (resourceUserIdField = 'userId') => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const resourceUserId = req.params[resourceUserIdField] || req.body[resourceUserIdField];
    
    // Admin can access any resource
    if (req.user.role === 'admin') {
      return next();
    }

    // User can only access their own resources
    if (req.user._id.toString() === resourceUserId) {
      return next();
    }

    logger.warn(`Access denied for user ${req.user.email} to resource ${resourceUserId}`);
    res.status(403).json({ error: 'Access denied' });
  };
};

/**
 * Rate limiting middleware for authentication attempts
 */
const authRateLimit = (req, res, next) => {
  // This would typically use a rate limiting library like express-rate-limit
  // For now, we'll just pass through
  next();
};

module.exports = {
  authenticate,
  optionalAuth,
  authorize,
  requireAdmin,
  requireModerator,
  requireSelfOrAdmin,
  authRateLimit
}; 