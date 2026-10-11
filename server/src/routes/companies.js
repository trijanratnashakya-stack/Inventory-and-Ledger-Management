const express = require('express');
const Company = require('../models/Company');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const companies = await Company.find().collation({ locale: 'en', strength: 2 }).sort({ isLocal: 1, name: 1 });
  res.json({ companies });
});

router.post('/', requireRole('admin', 'manager'), async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Company name is required' });
  const company = await Company.create({ name });
  res.status(201).json({ company });
});

router.patch('/:id', requireRole('admin'), async (req, res) => {
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name) return res.status(400).json({ error: 'Company name is required' });
  const company = await Company.findByIdAndUpdate(req.params.id, { name }, { new: true, runValidators: true });
  if (!company) return res.status(404).json({ error: 'Company not found' });
  res.json({ company });
});

module.exports = router;
