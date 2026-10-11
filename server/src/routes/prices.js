const express = require('express');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/prices?category=gem|non_gem&company=<id>&q=
// Non-gems come back grouped by company, gems as a single flat group.
router.get('/', async (req, res) => {
  const { category, company, q } = req.query;
  const filter = { active: true };
  if (['gem', 'non_gem'].includes(category)) filter.category = category;
  if (company && mongoose.Types.ObjectId.isValid(company)) filter.company = company;
  if (typeof q === 'string' && q.trim()) {
    const rx = new RegExp(escapeRegex(q.trim()), 'i');
    filter.$or = [{ productId: rx }, { name: rx }];
  }

  const products = await Product.find(filter)
    .collation({ locale: 'en', strength: 2, numericOrdering: true })
    .sort({ name: 1 })
    .populate('company', 'name isLocal');

  const groups = new Map();
  for (const p of products) {
    const key = p.category === 'gem' ? 'gems' : String(p.company._id);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        title: p.category === 'gem' ? 'Gems' : p.company.name,
        companyId: p.category === 'gem' ? null : p.company._id,
        isLocal: p.category === 'non_gem' && p.company.isLocal,
        items: [],
      });
    }
    groups.get(key).items.push({
      id: p._id,
      productId: p.productId || null,
      name: p.name,
      company: p.category === 'gem' ? 'Gems' : p.company.name,
      wholesalePrice: p.wholesalePrice,
      retailPrice: p.retailPrice,
      updatedAt: p.updatedAt,
    });
  }

  const sorted = [...groups.values()].sort((a, b) => Number(a.isLocal) - Number(b.isLocal) || a.title.localeCompare(b.title));
  res.json({ groups: sorted });
});

module.exports = router;
