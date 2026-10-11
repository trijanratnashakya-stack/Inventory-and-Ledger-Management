const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // The "Local / Unbranded" bucket is a real company record, not the string "Unknown".
    isLocal: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Case-insensitive uniqueness: "Aristo" and "aristo" cannot both exist.
companySchema.index({ name: 1 }, { unique: true, collation: { locale: 'en', strength: 2 } });

module.exports = mongoose.model('Company', companySchema);
