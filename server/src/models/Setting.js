const mongoose = require('mongoose');

const whole = { validator: Number.isInteger, message: '{PATH} must be a whole number' };

// One document (_id 'main') holding company-wide settings.
const settingSchema = new mongoose.Schema(
  {
    _id: { type: String },
    companyName: { type: String, trim: true, maxlength: 100, default: '' },
    address: { type: String, trim: true, maxlength: 200, default: '' },
    phone: { type: String, trim: true, maxlength: 40, default: '' },
    panNumber: { type: String, trim: true, maxlength: 30, default: '' },
    // Stock level at or below which a new product counts as "low".
    defaultLowStock: { type: Number, default: 12, min: [0, 'Low stock level cannot be negative'], validate: whole },
    // Suggested order = multiplier x low-stock level - current stock.
    reorderMultiplier: { type: Number, default: 2, min: [1, 'Reorder multiplier must be at least 1'], max: [10, 'Reorder multiplier can be at most 10'] },
    orderPrefix: { type: String, default: 'ORD', uppercase: true, trim: true, match: [/^[A-Z0-9]{1,6}$/, 'Order prefix must be 1 to 6 letters or digits'] },
    invoicePrefix: { type: String, default: 'INV', uppercase: true, trim: true, match: [/^[A-Z0-9]{1,6}$/, 'Invoice prefix must be 1 to 6 letters or digits'] },
    defaultCreditDays: { type: Number, default: 30, min: [0, 'Credit days cannot be negative'], max: [365, 'Credit days can be at most 365'], validate: whole },
    defaultDiscount: { type: Number, default: 0, min: [0, 'Discount cannot be negative'], max: [100, 'Discount can be at most 100%'] },
  },
  { timestamps: true }
);

settingSchema.statics.get = async function get() {
  let doc = await this.findById('main');
  if (!doc) {
    try {
      doc = await this.create({ _id: 'main' });
    } catch {
      doc = await this.findById('main'); // another request created it first
    }
  }
  return doc;
};

const FIELDS = ['companyName', 'address', 'phone', 'panNumber', 'defaultLowStock', 'reorderMultiplier', 'orderPrefix', 'invoicePrefix', 'defaultCreditDays', 'defaultDiscount'];
settingSchema.methods.toPublic = function toPublic() {
  return Object.fromEntries(FIELDS.map((f) => [f, this[f]]));
};

const Setting = mongoose.model('Setting', settingSchema);
Setting.FIELDS = FIELDS;
module.exports = Setting;
