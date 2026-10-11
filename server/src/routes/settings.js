const express = require('express');
const Setting = require('../models/Setting');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// Everyone signed in can read (the company name shows in the header, and defaults feed the forms).
router.get('/', async (req, res) => {
  const s = await Setting.get();
  res.json({ settings: s.toPublic() });
});

router.put('/', requireRole('Owner'), async (req, res) => {
  const s = await Setting.get();
  for (const key of Setting.FIELDS) {
    if (req.body && req.body[key] !== undefined) s[key] = req.body[key];
  }
  await s.save();
  res.json({ settings: s.toPublic() });
});

module.exports = router;
