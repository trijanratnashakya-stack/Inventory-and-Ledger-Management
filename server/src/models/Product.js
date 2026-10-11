const mongoose = require('mongoose');

const DEFAULT_LOW_STOCK = 12;

const productSchema = new mongoose.Schema(
  {
    category: { type: String, enum: ['gem', 'non_gem'], required: true, index: true },
    // Gems: required and globally unique. Non-gems: optional, but unique when present.
    productId: { type: String, trim: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    // Gems have no company (the UI shows "Gems"); non-gems must have one.
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    quantity: { type: Number, default: 0, min: 0 },
    // Units in one sack. Wholesale orders are placed in sacks, stock is counted in units.
    sackSize: { type: Number, default: 1, min: [1, 'Sack size must be at least 1'], validate: { validator: Number.isInteger, message: 'Sack size must be a whole number' } },
    lowStockThreshold: { type: Number, default: DEFAULT_LOW_STOCK, min: 0 },
    wholesalePrice: { type: Number, default: 0, min: 0 },
    retailPrice: { type: Number, default: 0, min: 0 },
    imageUrl: { type: String, trim: true },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

productSchema.pre('validate', function () {
  if (this.productId === '') this.productId = undefined;
  if (this.category === 'gem') {
    if (!this.productId) this.invalidate('productId', 'Gem products require a product ID');
    this.company = null;
  } else if (this.category === 'non_gem' && !this.company) {
    this.invalidate('company', 'Non-gem products require a company');
  }
});

// productId is globally unique whenever it is present. Deleted (inactive) products are ignored,
// so an ID or name can be reused after a product is deleted.
productSchema.index(
  { productId: 1 },
  { unique: true, partialFilterExpression: { productId: { $type: 'string' }, active: true }, collation: { locale: 'en', strength: 2 } }
);
// Non-gem names are unique per company ("Peeler" can exist under Senso and Choice).
productSchema.index(
  { company: 1, name: 1 },
  { unique: true, partialFilterExpression: { category: 'non_gem', active: true }, collation: { locale: 'en', strength: 2 } }
);
productSchema.index({ name: 'text' });

module.exports = mongoose.model('Product', productSchema);
module.exports.DEFAULT_LOW_STOCK = DEFAULT_LOW_STOCK;
