const { 
  authenticate, 
  optionalAuth, 
  authorize, 
  requireAdmin, 
  requireModerator, 
  requireSelfOrAdmin,
  authRateLimit 
} = require('../../src/middleware/auth');
const User = require('../../src/models/User');
const { generateToken } = require('../../src/utils/auth');

// Mock the logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Auth Middleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      header: jest.fn(),
      user: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  describe('authenticate', () => {
    let testUser, validToken;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      validToken = generateToken(testUser);
    });

    it('should authenticate user with valid token', async () => {
      mockReq.header.mockReturnValue(`Bearer ${validToken}`);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user._id.toString()).toBe(testUser._id.toString());
      expect(mockReq.token).toBe(validToken);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should return 401 for missing Authorization header', async () => {
      mockReq.header.mockReturnValue(null);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token format', async () => {
      mockReq.header.mockReturnValue('InvalidFormat');

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid token', async () => {
      mockReq.header.mockReturnValue('Bearer invalid.token');

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for non-existent user', async () => {
      const tokenForNonExistentUser = generateToken({
        _id: '507f1f77bcf86cd799439011',
        email: 'nonexistent@example.com',
        username: 'nonexistent',
        role: 'user'
      });

      mockReq.header.mockReturnValue(`Bearer ${tokenForNonExistentUser}`);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for inactive user', async () => {
      testUser.isActive = false;
      await testUser.save();

      mockReq.header.mockReturnValue(`Bearer ${validToken}`);

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('optionalAuth', () => {
    let testUser, validToken;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser();
      validToken = generateToken(testUser);
    });

    it('should authenticate user with valid token', async () => {
      mockReq.header.mockReturnValue(`Bearer ${validToken}`);

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeDefined();
      expect(mockReq.user._id.toString()).toBe(testUser._id.toString());
      expect(mockReq.token).toBe(validToken);
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without authentication for missing header', async () => {
      mockReq.header.mockReturnValue(null);

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeNull();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without authentication for invalid token', async () => {
      mockReq.header.mockReturnValue('Bearer invalid.token');

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeNull();
      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should continue without authentication for inactive user', async () => {
      testUser.isActive = false;
      await testUser.save();

      mockReq.header.mockReturnValue(`Bearer ${validToken}`);

      await optionalAuth(mockReq, mockRes, mockNext);

      expect(mockReq.user).toBeNull();
      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('authorize', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({ role: 'user' });
      mockReq.user = testUser;
    });

    it('should allow access for user with required role', () => {
      const authorizeUser = authorize('user');

      authorizeUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for user with one of required roles', () => {
      const authorizeModeratorOrAdmin = authorize(['moderator', 'admin']);

      authorizeModeratorOrAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for user without required role', () => {
      const authorizeAdmin = authorize('admin');

      authorizeAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for unauthenticated user', () => {
      mockReq.user = null;
      const authorizeUser = authorize('user');

      authorizeUser(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle single role as array', () => {
      const authorizeUser = authorize('user');

      authorizeUser(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('requireAdmin', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({ role: 'user' });
      mockReq.user = testUser;
    });

    it('should allow access for admin user', async () => {
      testUser.role = 'admin';
      await testUser.save();
      mockReq.user = testUser;

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for non-admin user', () => {
      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access for moderator user', async () => {
      testUser.role = 'moderator';
      await testUser.save();
      mockReq.user = testUser;

      requireAdmin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireModerator', () => {
    let testUser;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({ role: 'user' });
      mockReq.user = testUser;
    });

    it('should allow access for admin user', async () => {
      testUser.role = 'admin';
      await testUser.save();
      mockReq.user = testUser;

      requireModerator(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for moderator user', async () => {
      testUser.role = 'moderator';
      await testUser.save();
      mockReq.user = testUser;

      requireModerator(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for regular user', () => {
      requireModerator(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Insufficient permissions' });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('requireSelfOrAdmin', () => {
    let testUser, adminUser;

    beforeEach(async () => {
      testUser = await global.testUtils.createTestUser({ role: 'user' });
      adminUser = await global.testUtils.createTestUser({ 
        username: 'adminuser',
        email: 'admin@example.com',
        role: 'admin' 
      });
    });

    it('should allow access for admin to any resource', () => {
      mockReq.user = adminUser;
      mockReq.params = { userId: testUser._id.toString() };

      const middleware = requireSelfOrAdmin('userId');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for user to their own resource', () => {
      mockReq.user = testUser;
      mockReq.params = { userId: testUser._id.toString() };

      const middleware = requireSelfOrAdmin('userId');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should allow access for user to their own resource from body', () => {
      mockReq.user = testUser;
      mockReq.body = { userId: testUser._id.toString() };

      const middleware = requireSelfOrAdmin('userId');
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });

    it('should deny access for user to another user\'s resource', () => {
      mockReq.user = testUser;
      mockReq.params = { userId: adminUser._id.toString() };

      const middleware = requireSelfOrAdmin('userId');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Access denied' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for unauthenticated user', () => {
      mockReq.user = null;
      mockReq.params = { userId: testUser._id.toString() };

      const middleware = requireSelfOrAdmin('userId');
      middleware(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication required' });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use default field name when not specified', () => {
      mockReq.user = testUser;
      mockReq.params = { userId: testUser._id.toString() };

      const middleware = requireSelfOrAdmin();
      middleware(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('authRateLimit', () => {
    it('should call next function', () => {
      authRateLimit(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
    });
  });

  describe('Error Handling', () => {
    it('should handle token verification errors gracefully', async () => {
      mockReq.header.mockReturnValue('Bearer invalid.token');

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });
    });

    it('should handle database errors gracefully', async () => {
      const validToken = generateToken({
        _id: '507f1f77bcf86cd799439011',
        email: 'test@example.com',
        username: 'testuser',
        role: 'user'
      });

      mockReq.header.mockReturnValue(`Bearer ${validToken}`);

      // Mock User.findById to throw error
      const originalFindById = User.findById;
      User.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      await authenticate(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({ error: 'Authentication failed' });

      User.findById = originalFindById;
    });
  });
}); 