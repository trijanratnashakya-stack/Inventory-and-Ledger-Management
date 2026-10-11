const mongoose = require('mongoose');

const priceHistorySchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    oldWholesale: { type: Number, required: true },
    newWholesale: { type: Number, required: true },
    oldRetail: { type: Number, required: true },
    newRetail: { type: Number, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

priceHistorySchema.index({ createdAt: -1 });

module.exports = mongoose.model('PriceHistory', priceHistorySchema);
