const mongoose = require('mongoose');
const Post = require('../../src/models/Post');
const User = require('../../src/models/User');
const Category = require('../../src/models/Category');

describe('Post Model', () => {
  let testUser, testCategory;

  beforeEach(async () => {
    testUser = await global.testUtils.createTestUser();
    testCategory = await global.testUtils.createTestCategory();
  });

  describe('Schema Validation', () => {
    it('should create a post with valid data', async () => {
      const validPost = {
        title: 'Test Post Title',
        content: 'This is a test post content that meets the minimum length requirement.',
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(validPost);
      const savedPost = await post.save();

      expect(savedPost._id).toBeDefined();
      expect(savedPost.title).toBe(validPost.title);
      expect(savedPost.content).toBe(validPost.content);
      expect(savedPost.author.toString()).toBe(testUser._id.toString());
      expect(savedPost.category.toString()).toBe(testCategory._id.toString());
      expect(savedPost.status).toBe('draft'); // Default status
      expect(savedPost.isPublished).toBe(false); // Default published status
      expect(savedPost.slug).toBeDefined(); // Should be auto-generated
      expect(savedPost.excerpt).toBeDefined(); // Should be auto-generated
      expect(savedPost.readingTime).toBeGreaterThan(0); // Should be calculated
    });

    it('should require title', async () => {
      const postWithoutTitle = {
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(postWithoutTitle);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.title).toBeDefined();
    });

    it('should require content', async () => {
      const postWithoutContent = {
        title: 'Test Post',
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(postWithoutContent);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.content).toBeDefined();
    });

    it('should require author', async () => {
      const postWithoutAuthor = {
        title: 'Test Post',
        content: 'This is a test post content.',
        category: testCategory._id
      };

      const post = new Post(postWithoutAuthor);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.author).toBeDefined();
    });

    it('should require category', async () => {
      const postWithoutCategory = {
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id
      };

      const post = new Post(postWithoutCategory);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.category).toBeDefined();
    });

    it('should enforce minimum title length', async () => {
      const postWithShortTitle = {
        title: 'Test', // Too short
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(postWithShortTitle);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.title).toBeDefined();
    });

    it('should enforce maximum title length', async () => {
      const postWithLongTitle = {
        title: 'a'.repeat(201), // Too long
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(postWithLongTitle);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.title).toBeDefined();
    });

    it('should enforce minimum content length', async () => {
      const postWithShortContent = {
        title: 'Test Post',
        content: 'Short', // Too short
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(postWithShortContent);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.content).toBeDefined();
    });

    it('should enforce maximum content length', async () => {
      const postWithLongContent = {
        title: 'Test Post',
        content: 'a'.repeat(10001), // Too long
        author: testUser._id,
        category: testCategory._id
      };

      const post = new Post(postWithLongContent);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.content).toBeDefined();
    });

    it('should validate status enum', async () => {
      const postWithInvalidStatus = {
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id,
        status: 'invalid-status'
      };

      const post = new Post(postWithInvalidStatus);
      let err;

      try {
        await post.save();
      } catch (error) {
        err = error;
      }

      expect(err).toBeInstanceOf(mongoose.Error.ValidationError);
      expect(err.errors.status).toBeDefined();
    });

    it('should enforce unique slug', async () => {
      const postData = {
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      };

      await new Post(postData).save();

      const duplicatePost = new Post({
        title: 'Test Post', // Same title will generate same slug
        content: 'This is another test post content.',
        author: testUser._id,
        category: testCategory._id
      });

      let err;
      try {
        await duplicatePost.save();
      } catch (error) {
        err = error;
      }

      expect(err.code).toBe(11000); // Duplicate key error
    });
  });

  describe('Pre-save Middleware', () => {
    it('should generate slug from title', async () => {
      const post = new Post({
        title: 'Test Post Title With Special Characters!@#',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      });

      await post.save();

      expect(post.slug).toBe('test-post-title-with-special-characters');
    });

    it('should generate excerpt from content', async () => {
      const longContent = 'This is a very long content that should be truncated to create an excerpt. '.repeat(10);
      
      const post = new Post({
        title: 'Test Post',
        content: longContent,
        author: testUser._id,
        category: testCategory._id
      });

      await post.save();

      expect(post.excerpt).toContain('...');
      expect(post.excerpt.length).toBeLessThanOrEqual(153); // 150 chars + '...'
    });

    it('should calculate reading time', async () => {
      const content = 'This is a test content. '.repeat(50); // ~300 words
      
      const post = new Post({
        title: 'Test Post',
        content: content,
        author: testUser._id,
        category: testCategory._id
      });

      await post.save();

      expect(post.readingTime).toBeGreaterThan(0);
      expect(post.readingTime).toBe(Math.ceil(content.split(/\s+/).length / 200));
    });

    it('should set publishedAt when status changes to published', async () => {
      const post = new Post({
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id,
        status: 'draft'
      });

      await post.save();
      expect(post.publishedAt).toBeNull();

      post.status = 'published';
      await post.save();

      expect(post.publishedAt).toBeDefined();
      expect(post.isPublished).toBe(true);
    });

    it('should ensure unique slug by appending timestamp', async () => {
      const post1 = new Post({
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      });

      await post1.save();

      const post2 = new Post({
        title: 'Test Post',
        content: 'This is another test post content.',
        author: testUser._id,
        category: testCategory._id
      });

      await post2.save();

      expect(post2.slug).not.toBe(post1.slug);
      expect(post2.slug).toMatch(/^test-post-\d+$/);
    });
  });

  describe('Instance Methods', () => {
    let post;

    beforeEach(async () => {
      post = new Post({
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      });
      await post.save();
    });

    describe('incrementViewCount', () => {
      it('should increment view count', async () => {
        const initialCount = post.viewCount;
        await post.incrementViewCount();
        
        expect(post.viewCount).toBe(initialCount + 1);
      });
    });

    describe('incrementLikeCount', () => {
      it('should increment like count', async () => {
        const initialCount = post.likeCount;
        await post.incrementLikeCount();
        
        expect(post.likeCount).toBe(initialCount + 1);
      });
    });

    describe('decrementLikeCount', () => {
      it('should decrement like count', async () => {
        post.likeCount = 5;
        await post.save();
        
        await post.decrementLikeCount();
        expect(post.likeCount).toBe(4);
      });

      it('should not decrement below zero', async () => {
        post.likeCount = 0;
        await post.save();
        
        await post.decrementLikeCount();
        expect(post.likeCount).toBe(0);
      });
    });

    describe('incrementCommentCount', () => {
      it('should increment comment count', async () => {
        const initialCount = post.commentCount;
        await post.incrementCommentCount();
        
        expect(post.commentCount).toBe(initialCount + 1);
      });
    });

    describe('decrementCommentCount', () => {
      it('should decrement comment count', async () => {
        post.commentCount = 3;
        await post.save();
        
        await post.decrementCommentCount();
        expect(post.commentCount).toBe(2);
      });

      it('should not decrement below zero', async () => {
        post.commentCount = 0;
        await post.save();
        
        await post.decrementCommentCount();
        expect(post.commentCount).toBe(0);
      });
    });
  });

  describe('Virtual Properties', () => {
    it('should return correct URL', () => {
      const post = new Post({
        title: 'Test Post',
        content: 'This is a test post content.',
        author: testUser._id,
        category: testCategory._id
      });

      expect(post.url).toBe(`/posts/${post.slug}`);
    });
  });

  describe('Static Methods', () => {
    beforeEach(async () => {
      // Create multiple posts for testing
      await Post.create([
        {
          title: 'Published Post 1',
          content: 'This is a published post content.',
          author: testUser._id,
          category: testCategory._id,
          status: 'published',
          isPublished: true,
          publishedAt: new Date()
        },
        {
          title: 'Published Post 2',
          content: 'This is another published post content.',
          author: testUser._id,
          category: testCategory._id,
          status: 'published',
          isPublished: true,
          publishedAt: new Date()
        },
        {
          title: 'Draft Post',
          content: 'This is a draft post content.',
          author: testUser._id,
          category: testCategory._id,
          status: 'draft',
          isPublished: false
        }
      ]);
    });

    describe('findPublished', () => {
      it('should return only published posts', async () => {
        const publishedPosts = await Post.findPublished();
        
        expect(publishedPosts.length).toBe(2);
        publishedPosts.forEach(post => {
          expect(post.status).toBe('published');
          expect(post.isPublished).toBe(true);
        });
      });
    });

    describe('findByAuthor', () => {
      it('should return posts by specific author', async () => {
        const posts = await Post.findByAuthor(testUser._id);
        
        expect(posts.length).toBe(3);
        posts.forEach(post => {
          expect(post.author.toString()).toBe(testUser._id.toString());
        });
      });
    });

    describe('findByCategory', () => {
      it('should return posts by specific category', async () => {
        const posts = await Post.findByCategory(testCategory._id);
        
        expect(posts.length).toBe(3);
        posts.forEach(post => {
          expect(post.category.toString()).toBe(testCategory._id.toString());
        });
      });
    });

    describe('getPopular', () => {
      it('should return posts sorted by view and like count', async () => {
        // Update posts with different view/like counts
        const posts = await Post.find();
        posts[0].viewCount = 100;
        posts[0].likeCount = 50;
        posts[1].viewCount = 200;
        posts[1].likeCount = 30;
        await Promise.all(posts.map(post => post.save()));

        const popularPosts = await Post.getPopular(2);
        
        expect(popularPosts.length).toBe(2);
        expect(popularPosts[0].viewCount).toBeGreaterThanOrEqual(popularPosts[1].viewCount);
      });
    });

    describe('getRecent', () => {
      it('should return posts sorted by published date', async () => {
        const recentPosts = await Post.getRecent(2);
        
        expect(recentPosts.length).toBe(2);
        expect(recentPosts[0].publishedAt.getTime()).toBeGreaterThanOrEqual(recentPosts[1].publishedAt.getTime());
      });
    });
  });

  describe('Indexes', () => {
    it('should have required indexes', () => {
      const indexes = Post.schema.indexes();
      
      expect(indexes).toEqual(
        expect.arrayContaining([
          [{ slug: 1 }],
          [{ author: 1 }],
          [{ category: 1 }],
          [{ status: 1 }],
          [{ publishedAt: -1 }],
          [{ createdAt: -1 }],
          [{ title: 'text', content: 'text' }]
        ])
      );
    });
  });
}); 