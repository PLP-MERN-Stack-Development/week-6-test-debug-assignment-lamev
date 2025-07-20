const express = require('express');
const { body, query } = require('express-validator');
const Post = require('../models/Post');
const Category = require('../models/Category');
const { authenticate, requireModerator } = require('../middleware/auth');
const { asyncHandler, handleValidationErrors } = require('../middleware/errorHandler');
const { logger } = require('../utils/logger');

const router = express.Router();

// Validation rules
const createPostValidation = [
  body('title')
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .isLength({ min: 10, max: 10000 })
    .withMessage('Content must be between 10 and 10000 characters'),
  body('category')
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .isLength({ max: 20 })
    .withMessage('Each tag cannot exceed 20 characters'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Status must be draft, published, or archived')
];

const updatePostValidation = [
  body('title')
    .optional()
    .isLength({ min: 5, max: 200 })
    .withMessage('Title must be between 5 and 200 characters'),
  body('content')
    .optional()
    .isLength({ min: 10, max: 10000 })
    .withMessage('Content must be between 10 and 10000 characters'),
  body('category')
    .optional()
    .isMongoId()
    .withMessage('Valid category ID is required'),
  body('tags')
    .optional()
    .isArray()
    .withMessage('Tags must be an array'),
  body('tags.*')
    .isLength({ max: 20 })
    .withMessage('Each tag cannot exceed 20 characters'),
  body('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Status must be draft, published, or archived')
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
  query('category')
    .optional()
    .isMongoId()
    .withMessage('Category must be a valid MongoDB ID'),
  query('author')
    .optional()
    .isMongoId()
    .withMessage('Author must be a valid MongoDB ID'),
  query('status')
    .optional()
    .isIn(['draft', 'published', 'archived'])
    .withMessage('Status must be draft, published, or archived')
];

/**
 * @route   POST /api/posts
 * @desc    Create a new post
 * @access  Private
 */
router.post('/', authenticate, createPostValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { title, content, category, tags, status, featuredImage, seoTitle, seoDescription } = req.body;

  // Verify category exists
  const categoryExists = await Category.findById(category);
  if (!categoryExists) {
    return res.status(400).json({ error: 'Category not found' });
  }

  // Create post
  const post = new Post({
    title,
    content,
    category,
    tags: tags || [],
    status: status || 'draft',
    author: req.user._id,
    featuredImage,
    seoTitle,
    seoDescription
  });

  await post.save();

  // Populate author and category
  await post.populate('author', 'username firstName lastName avatar');
  await post.populate('category', 'name slug');

  logger.info(`New post created: ${post.title} by ${req.user.email}`);

  res.status(201).json({
    message: 'Post created successfully',
    post
  });
}));

/**
 * @route   GET /api/posts
 * @desc    Get all posts with pagination and filtering
 * @access  Public
 */
router.get('/', queryValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    author,
    status,
    search,
    sort = '-createdAt'
  } = req.query;

  // Build query
  const query = {};

  if (category) query.category = category;
  if (author) query.author = author;
  if (status) query.status = status;

  // Search functionality
  if (search) {
    query.$text = { $search: search };
  }

  // Calculate pagination
  const skip = (page - 1) * limit;

  // Execute query
  const posts = await Post.find(query)
    .populate('author', 'username firstName lastName avatar')
    .populate('category', 'name slug color')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  // Get total count
  const total = await Post.countDocuments(query);

  // Calculate pagination info
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;

  logger.info(`Posts retrieved: ${posts.length} posts, page ${page}`);

  res.json({
    posts,
    pagination: {
      currentPage: parseInt(page),
      totalPages,
      totalPosts: total,
      hasNextPage,
      hasPrevPage,
      limit: parseInt(limit)
    }
  });
}));

/**
 * @route   GET /api/posts/published
 * @desc    Get only published posts
 * @access  Public
 */
router.get('/published', queryValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    author,
    search,
    sort = '-publishedAt'
  } = req.query;

  // Build query for published posts only
  const query = {
    status: 'published',
    isPublished: true
  };

  if (category) query.category = category;
  if (author) query.author = author;
  if (search) query.$text = { $search: search };

  const skip = (page - 1) * limit;

  const posts = await Post.find(query)
    .populate('author', 'username firstName lastName avatar')
    .populate('category', 'name slug color')
    .sort(sort)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Post.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  res.json({
    posts,
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
 * @route   GET /api/posts/:id
 * @desc    Get a single post by ID
 * @access  Public
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id)
    .populate('author', 'username firstName lastName avatar bio')
    .populate('category', 'name slug description');

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Increment view count for published posts
  if (post.status === 'published') {
    await post.incrementViewCount();
  }

  logger.info(`Post viewed: ${post.title}`);

  res.json({ post });
}));

/**
 * @route   GET /api/posts/slug/:slug
 * @desc    Get a single post by slug
 * @access  Public
 */
router.get('/slug/:slug', asyncHandler(async (req, res) => {
  const post = await Post.findOne({ slug: req.params.slug })
    .populate('author', 'username firstName lastName avatar bio')
    .populate('category', 'name slug description');

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Increment view count for published posts
  if (post.status === 'published') {
    await post.incrementViewCount();
  }

  logger.info(`Post viewed by slug: ${post.title}`);

  res.json({ post });
}));

/**
 * @route   PUT /api/posts/:id
 * @desc    Update a post
 * @access  Private (author or moderator)
 */
router.put('/:id', authenticate, updatePostValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Check if user is author or moderator
  if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'moderator' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to update this post' });
  }

  // Verify category exists if provided
  if (req.body.category) {
    const categoryExists = await Category.findById(req.body.category);
    if (!categoryExists) {
      return res.status(400).json({ error: 'Category not found' });
    }
  }

  // Update post
  const updatedPost = await Post.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true, runValidators: true }
  ).populate('author', 'username firstName lastName avatar')
   .populate('category', 'name slug');

  logger.info(`Post updated: ${updatedPost.title} by ${req.user.email}`);

  res.json({
    message: 'Post updated successfully',
    post: updatedPost
  });
}));

/**
 * @route   DELETE /api/posts/:id
 * @desc    Delete a post
 * @access  Private (author or moderator)
 */
router.delete('/:id', authenticate, asyncHandler(async (req, res) => {
  const post = await Post.findById(req.params.id);

  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  // Check if user is author or moderator
  if (post.author.toString() !== req.user._id.toString() && req.user.role !== 'moderator' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Not authorized to delete this post' });
  }

  await Post.findByIdAndDelete(req.params.id);

  logger.info(`Post deleted: ${post.title} by ${req.user.email}`);

  res.json({
    message: 'Post deleted successfully'
  });
}));

/**
 * @route   GET /api/posts/author/:authorId
 * @desc    Get posts by author
 * @access  Public
 */
router.get('/author/:authorId', queryValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const { authorId } = req.params;

  const query = { author: authorId };
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
 * @route   GET /api/posts/category/:categoryId
 * @desc    Get posts by category
 * @access  Public
 */
router.get('/category/:categoryId', queryValidation, handleValidationErrors, asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const { categoryId } = req.params;

  const query = { category: categoryId };
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
 * @route   GET /api/posts/popular
 * @desc    Get popular posts
 * @access  Public
 */
router.get('/popular/:limit?', asyncHandler(async (req, res) => {
  const limit = parseInt(req.params.limit) || 10;
  
  const posts = await Post.getPopular(limit);

  res.json({ posts });
}));

/**
 * @route   GET /api/posts/recent
 * @desc    Get recent posts
 * @access  Public
 */
router.get('/recent/:limit?', asyncHandler(async (req, res) => {
  const limit = parseInt(req.params.limit) || 10;
  
  const posts = await Post.getRecent(limit);

  res.json({ posts });
}));

module.exports = router; 