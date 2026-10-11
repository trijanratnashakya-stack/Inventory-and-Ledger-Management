const mongoose = require('mongoose');

// Atomic sequence counters (used for order numbers: ORD-0001, ORD-0002, ...).
const counterSchema = new mongoose.Schema({
  _id: { type: String },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
