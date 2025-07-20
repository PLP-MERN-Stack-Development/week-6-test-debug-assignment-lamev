const jwt = require('jsonwebtoken');
const { 
  generateToken, 
  verifyToken, 
  decodeToken, 
  extractTokenFromHeader,
  isTokenExpired,
  getTokenExpiration,
  refreshToken
} = require('../../src/utils/auth');

// Mock the logger to avoid console output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

describe('Auth Utilities', () => {
  const mockUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com',
    username: 'testuser',
    role: 'user'
  };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(mockUser);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });

    it('should include user data in token payload', () => {
      const token = generateToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should include standard JWT claims', () => {
      const token = generateToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded.iss).toBe('mern-testing-app');
      expect(decoded.aud).toBe('mern-testing-users');
      expect(decoded.exp).toBeDefined();
      expect(decoded.iat).toBeDefined();
    });

    it('should set correct expiration time', () => {
      const token = generateToken(mockUser);
      const decoded = jwt.decode(token);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + (7 * 24 * 60 * 60); // 7 days

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp);
    });

    it('should throw error on token generation failure', () => {
      // Mock jwt.sign to throw error
      const originalSign = jwt.sign;
      jwt.sign = jest.fn().mockImplementation(() => {
        throw new Error('JWT signing failed');
      });

      expect(() => generateToken(mockUser)).toThrow('Token generation failed');

      jwt.sign = originalSign;
    });
  });

  describe('verifyToken', () => {
    let validToken;

    beforeEach(() => {
      validToken = generateToken(mockUser);
    });

    it('should verify a valid token', () => {
      const decoded = verifyToken(validToken);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should throw error for invalid token', () => {
      const invalidToken = 'invalid.token.here';

      expect(() => verifyToken(invalidToken)).toThrow('Invalid token');
    });

    it('should throw error for expired token', () => {
      // Create a token with past expiration
      const expiredToken = jwt.sign(
        { ...mockUser, exp: Math.floor(Date.now() / 1000) - 3600 }, // 1 hour ago
        process.env.JWT_SECRET || 'your-secret-key',
        { issuer: 'mern-testing-app', audience: 'mern-testing-users' }
      );

      expect(() => verifyToken(expiredToken)).toThrow('Invalid token');
    });

    it('should throw error for token with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        mockUser,
        'wrong-secret',
        { issuer: 'mern-testing-app', audience: 'mern-testing-users' }
      );

      expect(() => verifyToken(wrongSecretToken)).toThrow('Invalid token');
    });

    it('should throw error for token with wrong issuer', () => {
      const wrongIssuerToken = jwt.sign(
        mockUser,
        process.env.JWT_SECRET || 'your-secret-key',
        { issuer: 'wrong-issuer', audience: 'mern-testing-users' }
      );

      expect(() => verifyToken(wrongIssuerToken)).toThrow('Invalid token');
    });

    it('should throw error for token with wrong audience', () => {
      const wrongAudienceToken = jwt.sign(
        mockUser,
        process.env.JWT_SECRET || 'your-secret-key',
        { issuer: 'mern-testing-app', audience: 'wrong-audience' }
      );

      expect(() => verifyToken(wrongAudienceToken)).toThrow('Invalid token');
    });
  });

  describe('decodeToken', () => {
    let validToken;

    beforeEach(() => {
      validToken = generateToken(mockUser);
    });

    it('should decode a valid token without verification', () => {
      const decoded = decodeToken(validToken);

      expect(decoded.id).toBe(mockUser._id);
      expect(decoded.email).toBe(mockUser.email);
      expect(decoded.username).toBe(mockUser.username);
      expect(decoded.role).toBe(mockUser.role);
    });

    it('should decode an invalid token without verification', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = decodeToken(invalidToken);

      expect(decoded).toBeNull();
    });

    it('should handle malformed token gracefully', () => {
      const malformedToken = 'not.a.jwt.token';
      const decoded = decodeToken(malformedToken);

      expect(decoded).toBeNull();
    });
  });

  describe('extractTokenFromHeader', () => {
    it('should extract token from valid Authorization header', () => {
      const token = 'valid.jwt.token';
      const authHeader = `Bearer ${token}`;

      const extractedToken = extractTokenFromHeader(authHeader);

      expect(extractedToken).toBe(token);
    });

    it('should throw error for missing Authorization header', () => {
      expect(() => extractTokenFromHeader(null)).toThrow('Authorization header missing');
      expect(() => extractTokenFromHeader(undefined)).toThrow('Authorization header missing');
      expect(() => extractTokenFromHeader('')).toThrow('Authorization header missing');
    });

    it('should throw error for invalid Authorization header format', () => {
      expect(() => extractTokenFromHeader('InvalidFormat')).toThrow('Invalid authorization header format');
      expect(() => extractTokenFromHeader('Bearer')).toThrow('Invalid authorization header format');
      expect(() => extractTokenFromHeader('Bearer token extra')).toThrow('Invalid authorization header format');
    });

    it('should throw error for non-Bearer scheme', () => {
      expect(() => extractTokenFromHeader('Basic dGVzdDp0ZXN0')).toThrow('Invalid authorization header format');
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for expired token', () => {
      const expiredToken = jwt.sign(
        { ...mockUser, exp: Math.floor(Date.now() / 1000) - 3600 }, // 1 hour ago
        process.env.JWT_SECRET || 'your-secret-key'
      );

      expect(isTokenExpired(expiredToken)).toBe(true);
    });

    it('should return false for valid token', () => {
      const validToken = generateToken(mockUser);

      expect(isTokenExpired(validToken)).toBe(false);
    });

    it('should return true for token without expiration', () => {
      const tokenWithoutExp = jwt.sign(
        mockUser,
        process.env.JWT_SECRET || 'your-secret-key'
      );

      expect(isTokenExpired(tokenWithoutExp)).toBe(true);
    });

    it('should return true for invalid token', () => {
      expect(isTokenExpired('invalid.token')).toBe(true);
    });

    it('should handle malformed token gracefully', () => {
      expect(isTokenExpired('not.a.jwt.token')).toBe(true);
    });
  });

  describe('getTokenExpiration', () => {
    it('should return expiration date for valid token', () => {
      const validToken = generateToken(mockUser);
      const expiration = getTokenExpiration(validToken);

      expect(expiration).toBeInstanceOf(Date);
      expect(expiration.getTime()).toBeGreaterThan(Date.now());
    });

    it('should return null for token without expiration', () => {
      const tokenWithoutExp = jwt.sign(
        mockUser,
        process.env.JWT_SECRET || 'your-secret-key'
      );

      expect(getTokenExpiration(tokenWithoutExp)).toBeNull();
    });

    it('should return null for invalid token', () => {
      expect(getTokenExpiration('invalid.token')).toBeNull();
    });

    it('should handle malformed token gracefully', () => {
      expect(getTokenExpiration('not.a.jwt.token')).toBeNull();
    });
  });

  describe('refreshToken', () => {
    let originalToken;

    beforeEach(() => {
      originalToken = generateToken(mockUser);
    });

    it('should generate new token with same payload', () => {
      const newToken = refreshToken(originalToken);

      expect(newToken).toBeDefined();
      expect(typeof newToken).toBe('string');
      expect(newToken).not.toBe(originalToken);

      const originalDecoded = jwt.decode(originalToken);
      const newDecoded = jwt.decode(newToken);

      expect(newDecoded.id).toBe(originalDecoded.id);
      expect(newDecoded.email).toBe(originalDecoded.email);
      expect(newDecoded.username).toBe(originalDecoded.username);
      expect(newDecoded.role).toBe(originalDecoded.role);
    });

    it('should have new expiration time', () => {
      const newToken = refreshToken(originalToken);

      const originalDecoded = jwt.decode(originalToken);
      const newDecoded = jwt.decode(newToken);

      expect(newDecoded.exp).toBeGreaterThan(originalDecoded.exp);
    });

    it('should throw error for invalid token', () => {
      expect(() => refreshToken('invalid.token')).toThrow('Token refresh failed');
    });

    it('should throw error for malformed token', () => {
      expect(() => refreshToken('not.a.jwt.token')).toThrow('Token refresh failed');
    });

    it('should handle token generation failure', () => {
      // Mock generateToken to throw error
      const originalGenerateToken = require('../../src/utils/auth').generateToken;
      require('../../src/utils/auth').generateToken = jest.fn().mockImplementation(() => {
        throw new Error('Token generation failed');
      });

      expect(() => refreshToken(originalToken)).toThrow('Token refresh failed');

      require('../../src/utils/auth').generateToken = originalGenerateToken;
    });
  });

  describe('Environment Variables', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('should use custom JWT secret from environment', () => {
      process.env.JWT_SECRET = 'custom-secret-key';
      
      // Re-require the module to get fresh environment variables
      const { generateToken: customGenerateToken } = require('../../src/utils/auth');
      
      const token = customGenerateToken(mockUser);
      const decoded = jwt.decode(token);

      expect(decoded).toBeDefined();
    });

    it('should use custom JWT expiration from environment', () => {
      process.env.JWT_EXPIRES_IN = '1h';
      
      // Re-require the module to get fresh environment variables
      const { generateToken: customGenerateToken } = require('../../src/utils/auth');
      
      const token = customGenerateToken(mockUser);
      const decoded = jwt.decode(token);
      const now = Math.floor(Date.now() / 1000);
      const expectedExp = now + 3600; // 1 hour

      expect(decoded.exp).toBeGreaterThan(now);
      expect(decoded.exp).toBeLessThanOrEqual(expectedExp);
    });
  });
}); 