const express = require('express');
const rateLimit = require('express-rate-limit');
const User = require('../models/User');
const { COOKIE_NAME, signToken, cookieOptions, requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'test' ? 1000 : 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Try again in a few minutes.' },
});

router.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  const user = await User.findOne({ username: username.trim().toLowerCase() }).select('+passwordHash');
  const ok = user && user.active && (await user.verifyPassword(password));
  if (!ok) return res.status(401).json({ error: 'Invalid username or password' });
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions());
  res.json({ user: user.toPublic() });
});

router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// There is no public signup. Admins create accounts.
// POST /api/auth/password  { current, next }  (any signed-in user, for their own account)
router.post('/password', requireAuth, async (req, res) => {
  const { current, next } = req.body || {};
  if (typeof current !== 'string' || typeof next !== 'string') return res.status(400).json({ error: 'Enter your current and new password' });
  if (next.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters' });
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (!(await user.verifyPassword(current))) return res.status(400).json({ error: 'Current password is incorrect' });
  user.passwordHash = await User.hashPassword(next);
  await user.save();
  res.json({ ok: true });
});

router.patch('/me', requireAuth, async (req, res) => {
  if (req.body.displayName) {
    req.user.displayName = req.body.displayName;
    await req.user.save();
  }
  res.json({ user: req.user.toPublic() });
});

router.get('/users', requireAuth, requireRole('Owner'), async (req, res) => {
  const users = await User.find().sort({ username: 1 });
  res.json({ users: users.map((u) => u.toPublic()) });
});

router.post('/users', requireAuth, requireRole('Owner'), async (req, res) => {
  const { username, password, role, displayName } = req.body || {};
  if (typeof username !== 'string' || username.trim().length < 3) {
    return res.status(400).json({ error: 'Username must be at least 3 characters' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (role && !['Owner', 'manager', 'staff'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  const user = await User.create({
    username,
    displayName,
    role: role || 'staff',
    passwordHash: await User.hashPassword(password),
  });
  res.status(201).json({ user: user.toPublic() });
});

router.patch('/users/:id', requireAuth, requireRole('Owner'), async (req, res) => {
  const update = {};
  if (req.body.role) {
    if (!['Owner', 'manager', 'staff'].includes(req.body.role)) return res.status(400).json({ error: 'Invalid role' });
    update.role = req.body.role;
  }
  if (typeof req.body.active === 'boolean') update.active = req.body.active;
  if (String(req.user._id) === req.params.id && (update.active === false || (update.role && update.role !== 'Owner'))) {
    return res.status(400).json({ error: 'You cannot demote or deactivate your own account' });
  }
  if (req.body.password) {
    if (req.body.password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    update.passwordHash = await User.hashPassword(req.body.password);
  }
  const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user: user.toPublic() });
});

module.exports = router;
