const mongoose = require('mongoose');

// Append-only audit trail. Quantity on Product is the current value;
// this collection explains how it got there.
const stockMovementSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
    type: { type: String, enum: ['initial', 'in', 'out', 'adjust'], required: true },
    delta: { type: Number, required: true },
    quantityAfter: { type: Number, required: true },
    note: { type: String, trim: true, maxlength: 300 },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

stockMovementSchema.index({ createdAt: -1 });

module.exports = mongoose.model('StockMovement', stockMovementSchema);
