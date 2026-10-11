const mongoose = require('mongoose');

// A customer or a vendor. The running balance is never stored: it is always
// computed from the opening balance plus the ledger entries.
const partySchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['customer', 'vendor'], required: true, index: true },
    name: { type: String, required: [true, 'Name is required'], trim: true, maxlength: 120 },
    // Lower-cased copy of the name so "Ram Traders" and "ram traders" collide.
    nameKey: { type: String, index: false },
    phone: { type: String, trim: true, maxlength: 30 },
    address: { type: String, trim: true, maxlength: 200 },
    panNumber: { type: String, trim: true, maxlength: 20 },
    openingBalance: { type: Number, default: 0, min: [0, 'Opening balance cannot be negative'] },
    // dr = they owe us, cr = we owe them
    openingSide: { type: String, enum: ['dr', 'cr'], default: 'dr' },
    // Customers only: the standing discount we give them, and how many days they have to pay.
    discountPercent: {
      type: Number,
      default: 0,
      min: [0, 'Discount cannot be negative'],
      max: [100, 'Discount can be at most 100%'],
      validate: { validator: (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, message: 'Use at most 2 decimal places for the discount' },
    },
    creditDays: { type: Number, default: 30, min: [0, 'Credit days cannot be negative'], max: [365, 'Credit days can be at most 365'], validate: { validator: Number.isInteger, message: 'Credit days must be a whole number' } },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

partySchema.pre('validate', function () {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  if (this.type === 'vendor') this.discountPercent = 0;
});
partySchema.index({ type: 1, nameKey: 1 }, { unique: true });

module.exports = mongoose.model('Party', partySchema);
