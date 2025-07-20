const mongoose = require('mongoose');
const User = require('../../src/models/User');
const bcrypt = require('bcryptjs');

describe('User Model', () => {
  describe('Schema Validation', () => {
    it('should create a user with valid data', async () => {
      const validUser = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'Test',
        lastName: 'User'
      };

      const user = new User(validUser);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.username).toBe(validUser.username);
      expect(savedUser.email).toBe(validUser.email);
      expect(savedUser.firstName).toBe(validUser.firstName);
      expect(savedUser.lastName).toBe(validUser.lastName);
      expect(savedUser.password).not.toBe(validUser.password); // Should be hashed
      expect(savedUser.role).toBe('user'); // Default role
      expect(savedUser.isActive).toBe(true); // Default active status
    });

    it('should require username', async () => {
      const userWithoutUsername = {
        email: 'test@example.com',
        password: 'Password123'
      };

      const user = new User(userWithoutUsername);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.username).toBeDefined();
    });

    it('should require email', async () => {
      const userWithoutEmail = {
        username: 'testuser',
        password: 'Password123'
      };

      const user = new User(userWithoutEmail);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.email).toBeDefined();
    });

    it('should require password', async () => {
      const userWithoutPassword = {
        username: 'testuser',
        email: 'test@example.com'
      };

      const user = new User(userWithoutPassword);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.password).toBeDefined();
    });

    it('should validate email format', async () => {
      const userWithInvalidEmail = {
        username: 'testuser',
        email: 'invalid-email',
        password: 'Password123'
      };

      const user = new User(userWithInvalidEmail);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.email).toBeDefined();
    });

    it('should validate username format', async () => {
      const userWithInvalidUsername = {
        username: 'test-user@123', // Contains invalid characters
        email: 'test@example.com',
        password: 'Password123'
      };

      const user = new User(userWithInvalidUsername);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.username).toBeDefined();
    });

    it('should enforce minimum password length', async () => {
      const userWithShortPassword = {
        username: 'testuser',
        email: 'test@example.com',
        password: '123' // Too short
      };

      const user = new User(userWithShortPassword);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.password).toBeDefined();
    });

    it('should enforce username length limits', async () => {
      const userWithLongUsername = {
        username: 'a'.repeat(31), // Too long
        email: 'test@example.com',
        password: 'Password123'
      };

      const user = new User(userWithLongUsername);
      let err;

      try {
        await user.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.username).toBeDefined();
    });

    it('should enforce unique username', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123'
      };

      await new User(userData).save();

      const duplicateUser = new User({
        username: 'testuser',
        email: 'test2@example.com',
        password: 'Password123'
      });

      let err;
      try {
        await duplicateUser.save();
      } catch (error) {
        err = error;
      }

      expect(err.code).toBe(11000); // Duplicate key error
    });

    it('should enforce unique email', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123'
      };

      await new User(userData).save();

      const duplicateUser = new User({
        username: 'testuser2',
        email: 'test@example.com',
        password: 'Password123'
      });

      let err;
      try {
        await duplicateUser.save();
      } catch (error) {
        err = error;
      }

      expect(err.code).toBe(11000); // Duplicate key error
    });
  });

  describe('Password Hashing', () => {
    it('should hash password before saving', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123'
      };

      const user = new User(userData);
      await user.save();

      expect(user.password).not.toBe(userData.password);
      expect(user.password).toMatch(/^\$2[aby]\$\d{1,2}\$[./A-Za-z0-9]{53}$/); // bcrypt format
    });

    it('should not rehash password if not modified', async () => {
      const userData = {
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123'
      };

      const user = new User(userData);
      await user.save();

      const originalHash = user.password;

      // Update non-password field
      user.firstName = 'Updated';
      await user.save();

      expect(user.password).toBe(originalHash);
    });
  });

  describe('Instance Methods', () => {
    let user;

    beforeEach(async () => {
      user = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123'
      });
      await user.save();
    });

    describe('comparePassword', () => {
      it('should return true for correct password', async () => {
        const isMatch = await user.comparePassword('Password123');
        expect(isMatch).toBe(true);
      });

      it('should return false for incorrect password', async () => {
        const isMatch = await user.comparePassword('WrongPassword');
        expect(isMatch).toBe(false);
      });

      it('should throw error for password comparison failure', async () => {
        // Mock bcrypt.compare to throw error
        const originalCompare = bcrypt.compare;
        bcrypt.compare = jest.fn().mockRejectedValue(new Error('bcrypt error'));

        await expect(user.comparePassword('Password123')).rejects.toThrow('Password comparison failed');

        bcrypt.compare = originalCompare;
      });
    });

    describe('getPublicProfile', () => {
      it('should return user object without password and __v', () => {
        const publicProfile = user.getPublicProfile();

        expect(publicProfile.password).toBeUndefined();
        expect(publicProfile.__v).toBeUndefined();
        expect(publicProfile.username).toBe(user.username);
        expect(publicProfile.email).toBe(user.email);
      });
    });
  });

  describe('Virtual Properties', () => {
    it('should return full name when firstName and lastName are provided', () => {
      const user = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123',
        firstName: 'John',
        lastName: 'Doe'
      });

      expect(user.fullName).toBe('John Doe');
    });

    it('should return username when firstName or lastName is missing', () => {
      const user = new User({
        username: 'testuser',
        email: 'test@example.com',
        password: 'Password123'
      });

      expect(user.fullName).toBe('testuser');
    });
  });

  describe('Static Methods', () => {
    describe('findByCredentials', () => {
      let user;

      beforeEach(async () => {
        user = new User({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123'
        });
        await user.save();
      });

      it('should find user with correct credentials', async () => {
        const foundUser = await User.findByCredentials('test@example.com', 'Password123');
        expect(foundUser._id.toString()).toBe(user._id.toString());
      });

      it('should throw error for non-existent email', async () => {
        await expect(User.findByCredentials('nonexistent@example.com', 'Password123'))
          .rejects.toThrow('Invalid login credentials');
      });

      it('should throw error for incorrect password', async () => {
        await expect(User.findByCredentials('test@example.com', 'WrongPassword'))
          .rejects.toThrow('Invalid login credentials');
      });
    });

    describe('emailExists', () => {
      beforeEach(async () => {
        await new User({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123'
        }).save();
      });

      it('should return true for existing email', async () => {
        const exists = await User.emailExists('test@example.com');
        expect(exists).toBe(true);
      });

      it('should return false for non-existing email', async () => {
        const exists = await User.emailExists('nonexistent@example.com');
        expect(exists).toBe(false);
      });
    });

    describe('usernameExists', () => {
      beforeEach(async () => {
        await new User({
          username: 'testuser',
          email: 'test@example.com',
          password: 'Password123'
        }).save();
      });

      it('should return true for existing username', async () => {
        const exists = await User.usernameExists('testuser');
        expect(exists).toBe(true);
      });

      it('should return false for non-existing username', async () => {
        const exists = await User.usernameExists('nonexistentuser');
        expect(exists).toBe(false);
      });
    });
  });

  describe('Indexes', () => {
    it('should have indexes on email, username, and createdAt', () => {
      const indexes = User.collection.getIndexes();
      
      // Note: In test environment, indexes might not be created immediately
      // This test verifies the index definitions exist
      expect(User.schema.indexes()).toEqual(
        expect.arrayContaining([
          [{ email: 1 }],
          [{ username: 1 }],
          [{ createdAt: -1 }]
        ])
      );
    });
  });
}); 