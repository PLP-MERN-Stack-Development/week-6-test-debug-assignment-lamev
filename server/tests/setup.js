const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

// Setup before all tests
beforeAll(async () => {
  try {
    // Create in-memory MongoDB instance with increased timeout
    mongoServer = await MongoMemoryServer.create({
      instance: {
        dbName: 'test-db',
        port: 27017
      }
    });
    const mongoUri = mongoServer.getUri();
    
    // Connect to the in-memory database with increased timeout
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      connectTimeoutMS: 60000,
    });

    // Define global test utilities after database connection
    global.testUtils = {
      // Create a test user
      createTestUser: async (userData = {}) => {
        const User = require('../src/models/User');
        const bcrypt = require('bcryptjs');
        
        const defaultUser = {
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123',
          firstName: 'Test',
          lastName: 'User'
        };
        
        const userDataToSave = { ...defaultUser, ...userData };
        
        // Hash password if provided
        if (userDataToSave.password) {
          userDataToSave.password = await bcrypt.hash(userDataToSave.password, 10);
        }
        
        const user = new User(userDataToSave);
        return await user.save();
      },

      // Create a test category
      createTestCategory: async (categoryData = {}) => {
        const Category = require('../src/models/Category');
        const defaultCategory = {
          name: 'Test Category',
          description: 'A test category for testing purposes'
        };
        
        const category = new Category({ ...defaultCategory, ...categoryData });
        return await category.save();
      },

      // Create a test post
      createTestPost: async (postData = {}) => {
        const Post = require('../src/models/Post');
        const User = require('../src/models/User');
        const Category = require('../src/models/Category');
        
        // Create default author and category if not provided
        let author = postData.author;
        let category = postData.category;
        
        if (!author) {
          author = await global.testUtils.createTestUser();
        }
        
        if (!category) {
          category = await global.testUtils.createTestCategory();
        }
        
        const defaultPost = {
          title: 'Test Post',
          content: 'This is a test post content for testing purposes.',
          status: 'published',
          isPublished: true
        };
        
        const post = new Post({
          ...defaultPost,
          ...postData,
          author: author._id,
          category: category._id
        });
        
        return await post.save();
      },

      // Generate JWT token for testing
      generateTestToken: (user) => {
        const { generateToken } = require('../src/utils/auth');
        return generateToken(user);
      },

      // Mock request object
      mockRequest: (data = {}) => {
        return {
          body: data.body || {},
          params: data.params || {},
          query: data.query || {},
          headers: data.headers || {},
          user: data.user || null,
          ...data
        };
      },

      // Mock response object
      mockResponse: () => {
        const res = {};
        res.status = jest.fn().mockReturnValue(res);
        res.json = jest.fn().mockReturnValue(res);
        res.send = jest.fn().mockReturnValue(res);
        return res;
      },

      // Mock next function
      mockNext: () => jest.fn(),

      // Wait for a specified time (useful for testing async operations)
      wait: (ms) => new Promise(resolve => setTimeout(resolve, ms))
    };

  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}, 60000); // Increase timeout to 60 seconds

// Clean up after each test
afterEach(async () => {
  try {
    // Clear all collections after each test
    const collections = mongoose.connection.collections;
    
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  } catch (error) {
    console.error('Failed to clean up collections:', error);
  }
});

// Clean up after all tests
afterAll(async () => {
  try {
    // Disconnect from the in-memory database
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
    
    // Stop the in-memory MongoDB instance
    if (mongoServer) {
      await mongoServer.stop();
    }
  } catch (error) {
    console.error('Failed to cleanup test database:', error);
  }
}, 30000);

// Suppress console logs during tests
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeAll(() => {
  console.log = jest.fn();
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Increase timeout for tests
jest.setTimeout(30000); 