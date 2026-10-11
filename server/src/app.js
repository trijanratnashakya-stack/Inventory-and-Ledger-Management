const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN || 'http://localhost:3000').split(','),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes/auth'));
app.use('/api/companies', require('./routes/companies'));
app.use('/api/products', require('./routes/products'));
app.use('/api/prices', require('./routes/prices'));
app.use('/api/orders', require('./routes/orders'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/parties', require('./routes/parties'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/export', require('./routes/exports'));
app.use('/api/dashboard', require('./routes/dashboard'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// Express 5 forwards async errors here.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.code === 11000) {
    const key = Object.keys(err.keyPattern || {});
    const message = key.includes('productId')
      ? 'That product ID is already in use'
      : key.includes('name') && key.includes('company')
        ? 'This company already has a product with that name'
        : key.includes('nameKey')
          ? 'An account with that name already exists'
          : 'That value already exists';
    return res.status(409).json({ error: message });
  }
  if (err && err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map((e) => e.message);
    return res.status(400).json({ error: errors[0], errors });
  }
  if (err && err.name === 'CastError') return res.status(400).json({ error: 'Invalid value' });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

module.exports = app;
