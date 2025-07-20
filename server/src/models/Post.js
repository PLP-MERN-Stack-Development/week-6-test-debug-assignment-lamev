const mongoose = require('mongoose');
const slugify = require('slugify');

const postSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Post title is required'],
    trim: true,
    minlength: [5, 'Title must be at least 5 characters long'],
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  content: {
    type: String,
    required: [true, 'Post content is required'],
    minlength: [10, 'Content must be at least 10 characters long'],
    maxlength: [10000, 'Content cannot exceed 10000 characters']
  },
  slug: {
    type: String,
    lowercase: true,
    trim: true
  },
  excerpt: {
    type: String,
    maxlength: [300, 'Excerpt cannot exceed 300 characters']
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Post author is required']
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    required: [true, 'Post category is required']
  },
  tags: [{
    type: String,
    trim: true,
    lowercase: true,
    maxlength: [20, 'Tag cannot exceed 20 characters']
  }],
  featuredImage: {
    type: String,
    default: null
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'archived'],
    default: 'draft'
  },
  isPublished: {
    type: Boolean,
    default: false
  },
  publishedAt: {
    type: Date,
    default: null
  },
  viewCount: {
    type: Number,
    default: 0
  },
  likeCount: {
    type: Number,
    default: 0
  },
  commentCount: {
    type: Number,
    default: 0
  },
  readingTime: {
    type: Number,
    default: 0
  },
  seoTitle: {
    type: String,
    maxlength: [60, 'SEO title cannot exceed 60 characters']
  },
  seoDescription: {
    type: String,
    maxlength: [160, 'SEO description cannot exceed 160 characters']
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for comments
postSchema.virtual('comments', {
  ref: 'Comment',
  localField: '_id',
  foreignField: 'post'
});

// Virtual for likes
postSchema.virtual('likes', {
  ref: 'Like',
  localField: '_id',
  foreignField: 'post'
});

// Virtual for URL
postSchema.virtual('url').get(function() {
  return `/posts/${this.slug}`;
});

// Indexes for better query performance
postSchema.index({ slug: 1 });
postSchema.index({ author: 1 });
postSchema.index({ category: 1 });
postSchema.index({ status: 1 });
postSchema.index({ publishedAt: -1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ title: 'text', content: 'text' });

// Pre-save middleware to generate slug and excerpt
postSchema.pre('save', function(next) {
  // Generate slug from title if not provided
  if (!this.slug && this.title) {
    this.slug = slugify(this.title, { 
      lower: true, 
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }

  // Generate excerpt from content if not provided
  if (!this.excerpt && this.content) {
    this.excerpt = this.content.substring(0, 150).trim() + '...';
  }

  // Calculate reading time (average 200 words per minute)
  if (this.content) {
    const wordCount = this.content.split(/\s+/).length;
    this.readingTime = Math.ceil(wordCount / 200);
  }

  // Set publishedAt when status changes to published
  if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
    this.publishedAt = new Date();
    this.isPublished = true;
  }

  next();
});

// Pre-save middleware to ensure unique slug
postSchema.pre('save', async function(next) {
  if (this.isModified('slug')) {
    const existingPost = await this.constructor.findOne({ 
      slug: this.slug, 
      _id: { $ne: this._id } 
    });
    
    if (existingPost) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }
  next();
});

// Instance method to increment view count
postSchema.methods.incrementViewCount = async function() {
  this.viewCount += 1;
  return await this.save();
};

// Instance method to increment like count
postSchema.methods.incrementLikeCount = async function() {
  this.likeCount += 1;
  return await this.save();
};

// Instance method to decrement like count
postSchema.methods.decrementLikeCount = async function() {
  if (this.likeCount > 0) {
    this.likeCount -= 1;
  }
  return await this.save();
};

// Instance method to increment comment count
postSchema.methods.incrementCommentCount = async function() {
  this.commentCount += 1;
  return await this.save();
};

// Instance method to decrement comment count
postSchema.methods.decrementCommentCount = async function() {
  if (this.commentCount > 0) {
    this.commentCount -= 1;
  }
  return await this.save();
};

// Static method to find published posts
postSchema.statics.findPublished = function() {
  return this.find({ 
    status: 'published', 
    isPublished: true 
  }).populate('author', 'username firstName lastName avatar');
};

// Static method to find posts by author
postSchema.statics.findByAuthor = function(authorId) {
  return this.find({ author: authorId }).populate('author', 'username firstName lastName avatar');
};

// Static method to find posts by category
postSchema.statics.findByCategory = function(categoryId) {
  return this.find({ category: categoryId }).populate('author', 'username firstName lastName avatar');
};

// Static method to search posts
postSchema.statics.search = function(query) {
  return this.find({
    $text: { $search: query },
    status: 'published',
    isPublished: true
  }).populate('author', 'username firstName lastName avatar');
};

// Static method to get popular posts
postSchema.statics.getPopular = function(limit = 10) {
  return this.find({
    status: 'published',
    isPublished: true
  })
  .sort({ viewCount: -1, likeCount: -1 })
  .limit(limit)
  .populate('author', 'username firstName lastName avatar');
};

// Static method to get recent posts
postSchema.statics.getRecent = function(limit = 10) {
  return this.find({
    status: 'published',
    isPublished: true
  })
  .sort({ publishedAt: -1 })
  .limit(limit)
  .populate('author', 'username firstName lastName avatar');
};

module.exports = mongoose.model('Post', postSchema); 