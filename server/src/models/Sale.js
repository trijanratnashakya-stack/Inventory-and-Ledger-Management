const mongoose = require('mongoose');

const twoDecimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

const saleItemSchema = new mongoose.Schema(
  {
    product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    productId: { type: String },
    name: { type: String, required: true },
    company: { type: String },
    category: { type: String, enum: ['gem', 'non_gem'] },
    quantity: { type: Number, required: true, min: 1, validate: Number.isInteger },
    priceType: { type: String, enum: ['retail', 'wholesale', 'custom'], default: 'retail' },
    unitPrice: { type: Number, required: true, min: 0, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places for unit price' } },
    total: { type: Number, required: true, min: 0, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places for line total' } },
  },
  { _id: false }
);

const saleSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    // Gregorian date YYYY-MM-DD
    date: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must look like YYYY-MM-DD'] },
    customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', default: null, index: true },
    customerName: { type: String, required: [true, 'Customer name is required'], trim: true, maxlength: 120 },
    customerPhone: { type: String, trim: true, maxlength: 30 },
    customerAddress: { type: String, trim: true, maxlength: 200 },
    customerPan: { type: String, trim: true, maxlength: 20 },
    items: {
      type: [saleItemSchema],
      validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'A sale needs at least one item' },
    },
    subtotal: { type: Number, required: true, min: 0, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places' } },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    discountAmount: { type: Number, default: 0, min: 0, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places' } },
    grandTotal: { type: Number, required: true, min: 0, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places' } },
    paymentType: { type: String, enum: ['cash', 'credit', 'bank', 'partial'], default: 'cash', index: true },
    paidAmount: { type: Number, default: 0, min: 0, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places' } },
    status: { type: String, enum: ['completed', 'voided'], default: 'completed', index: true },
    note: { type: String, trim: true, maxlength: 500 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    ledgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
    paymentLedgerEntry: { type: mongoose.Schema.Types.ObjectId, ref: 'LedgerEntry' },
  },
  { timestamps: true }
);

saleSchema.index({ createdAt: -1 });
saleSchema.index({ date: -1 });

module.exports = mongoose.model('Sale', saleSchema);
