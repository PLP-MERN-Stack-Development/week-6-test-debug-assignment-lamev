const jwt = require('jsonwebtoken');
const { logger } = require('./logger');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Generate JWT token for user
 * @param {Object} user - User object
 * @returns {String} JWT token
 */
const generateToken = (user) => {
  try {
    const payload = {
      id: user._id,
      email: user.email,
      username: user.username,
      role: user.role
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
      issuer: 'mern-testing-app',
      audience: 'mern-testing-users'
    });

    logger.info(`Token generated for user: ${user.email}`);
    return token;
  } catch (error) {
    logger.error('Error generating token:', error);
    throw new Error('Token generation failed');
  }
};

/**
 * Verify JWT token
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    logger.debug(`Token verified for user: ${decoded.email}`);
    return decoded;
  } catch (error) {
    logger.error('Token verification failed:', error.message);
    throw new Error('Invalid token');
  }
};

/**
 * Decode JWT token without verification (for debugging)
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const decodeToken = (token) => {
  try {
    const decoded = jwt.decode(token);
    logger.debug('Token decoded:', decoded);
    return decoded;
  } catch (error) {
    logger.error('Token decoding failed:', error.message);
    throw new Error('Token decoding failed');
  }
};

/**
 * Extract token from Authorization header
 * @param {String} authHeader - Authorization header
 * @returns {String} Token
 */
const extractTokenFromHeader = (authHeader) => {
  if (!authHeader) {
    throw new Error('Authorization header missing');
  }

  const parts = authHeader.split(' ');
  
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    throw new Error('Invalid authorization header format');
  }

  return parts[1];
};

/**
 * Check if token is expired
 * @param {String} token - JWT token
 * @returns {Boolean} True if expired
 */
const isTokenExpired = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return true;
    }
    
    const currentTime = Math.floor(Date.now() / 1000);
    return decoded.exp < currentTime;
  } catch (error) {
    logger.error('Error checking token expiration:', error);
    return true;
  }
};

/**
 * Get token expiration time
 * @param {String} token - JWT token
 * @returns {Date} Expiration date
 */
const getTokenExpiration = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) {
      return null;
    }
    
    return new Date(decoded.exp * 1000);
  } catch (error) {
    logger.error('Error getting token expiration:', error);
    return null;
  }
};

/**
 * Refresh token (generate new token with same payload)
 * @param {String} token - Current JWT token
 * @returns {String} New JWT token
 */
const refreshToken = (token) => {
  try {
    const decoded = jwt.decode(token);
    if (!decoded) {
      throw new Error('Invalid token');
    }

    // Remove standard JWT claims
    const { iat, exp, aud, iss, ...payload } = decoded;
    
    return generateToken(payload);
  } catch (error) {
    logger.error('Error refreshing token:', error);
    throw new Error('Token refresh failed');
  }
};

module.exports = {
  generateToken,
  verifyToken,
  decodeToken,
  extractTokenFromHeader,
  isTokenExpired,
  getTokenExpiration,
  refreshToken
}; 