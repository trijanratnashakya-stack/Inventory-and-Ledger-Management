const mongoose = require('mongoose');

// Each line keeps a snapshot of the product's name, ID and company at order
// time, so an old order still reads correctly if the product is renamed later.
const orderItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productId: { type: String },
    name: { type: String, required: true },
    company: { type: String },
    category: { type: String, enum: ['gem', 'non_gem'] },
    // quantity is the number of sacks ordered; sackSize is the units per sack at order time.
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    sackSize: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    number: { type: String, required: true, unique: true },
    status: { type: String, enum: ['open', 'received', 'cancelled'], default: 'open', index: true },
    note: { type: String, trim: true, maxlength: 500 },
    items: {
      type: [orderItemSchema],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'An order needs at least one item' },
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    receivedAt: { type: Date },
    receivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Order', orderSchema);
