const mongoose = require('mongoose');

const twoDecimals = (v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

// Append-only. A mistake is voided (kept on record, excluded from the balance)
// and re-entered, so the history always shows what happened.
const ledgerEntrySchema = new mongoose.Schema(
  {
    party: { type: mongoose.Schema.Types.ObjectId, ref: 'Party', required: true, index: true },
    // Gregorian date as YYYY-MM-DD. The UI shows and accepts Bikram Sambat.
    date: { type: String, required: true, match: [/^\d{4}-\d{2}-\d{2}$/, 'Date must look like YYYY-MM-DD'] },
    particulars: {
      type: String,
      required: [true, 'Particulars are required'],
      enum: ['Opening Balance', 'Goods', 'Cash'],
      trim: true,
      maxlength: 200,
    },
    ref: { type: String, trim: true, maxlength: 40 },
    debit: { type: Number, default: 0, min: 0, max: 1e10, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places' } },
    credit: { type: Number, default: 0, min: 0, max: 1e10, validate: { validator: twoDecimals, message: 'Use at most 2 decimal places' } },
    voided: { type: Boolean, default: false },
    voidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    voidedAt: { type: Date },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

ledgerEntrySchema.pre('validate', function () {
  const d = this.debit || 0;
  const c = this.credit || 0;
  if ((d > 0) === (c > 0)) this.invalidate('debit', 'Enter either a debit or a credit amount, not both');
});

module.exports = mongoose.model('LedgerEntry', ledgerEntrySchema);
