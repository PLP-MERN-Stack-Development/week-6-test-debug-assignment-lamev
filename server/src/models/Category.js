const mongoose = require('mongoose');
const slugify = require('slugify');

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    minlength: [2, 'Category name must be at least 2 characters long'],
    maxlength: [50, 'Category name cannot exceed 50 characters']
  },
  slug: {
    type: String,
    lowercase: true,
    trim: true
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters']
  },
  color: {
    type: String,
    default: '#6c757d',
    match: [/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color']
  },
  icon: {
    type: String,
    default: 'folder'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  parent: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Category',
    default: null
  },
  order: {
    type: Number,
    default: 0
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Virtual for posts count
categorySchema.virtual('postsCount', {
  ref: 'Post',
  localField: '_id',
  foreignField: 'category',
  count: true
});

// Virtual for subcategories
categorySchema.virtual('subcategories', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent'
});

// Indexes
categorySchema.index({ slug: 1 });
categorySchema.index({ name: 1 });
categorySchema.index({ parent: 1 });
categorySchema.index({ order: 1 });

// Pre-save middleware to generate slug
categorySchema.pre('save', function(next) {
  if (!this.slug && this.name) {
    this.slug = slugify(this.name, { 
      lower: true, 
      strict: true,
      remove: /[*+~.()'"!:@]/g
    });
  }
  next();
});

// Pre-save middleware to ensure unique slug
categorySchema.pre('save', async function(next) {
  if (this.isModified('slug')) {
    const existingCategory = await this.constructor.findOne({ 
      slug: this.slug, 
      _id: { $ne: this._id } 
    });
    
    if (existingCategory) {
      this.slug = `${this.slug}-${Date.now()}`;
    }
  }
  next();
});

// Static method to find active categories
categorySchema.statics.findActive = function() {
  return this.find({ isActive: true }).sort({ order: 1, name: 1 });
};

// Static method to find root categories
categorySchema.statics.findRoot = function() {
  return this.find({ parent: null, isActive: true }).sort({ order: 1, name: 1 });
};

// Static method to find subcategories
categorySchema.statics.findSubcategories = function(parentId) {
  return this.find({ parent: parentId, isActive: true }).sort({ order: 1, name: 1 });
};

module.exports = mongoose.model('Category', categorySchema); 