require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');
const Company = require('./models/Company');
const Product = require('./models/Product');
const StockMovement = require('./models/StockMovement');
const PriceHistory = require('./models/PriceHistory');
const Order = require('./models/Order');
const Counter = require('./models/Counter');
const Party = require('./models/Party');
const LedgerEntry = require('./models/LedgerEntry');
const Setting = require('./models/Setting');

// Sample data mirrors the Figma screens (kitchenware). Names here are generic
// demo values, safe to show in a public portfolio.
const GEMS = [
  // [productId, name, quantity, wholesale, retail]
  ['4013', 'Gamala', 15, 180, 220],
  ['4014', 'Gamala', 0, 190, 230],
  ['802', 'Plate', 8, 60, 85],
  ['2100', 'Bata', 45, 40, 60],
  ['105', 'Bucket', 12, 150, 190],
  ['2013', 'Collander', 0, 120, 160],
  ['2017', 'Dish Rack', 28, 260, 320],
  ['2011', 'Laundry Basket', 5, 210, 270],
  ['4700', 'Laundry Basket Large', 0, 280, 340],
  ['P20', 'Bucket', 22, 170, 210],
  ['8000', 'Gamala', 0, 300, 360],
  ['406', 'Gamala', 0, 140, 175],
  ['501', 'Masala Box', 5, 90, 120],
];

const NON_GEMS = {
  Aristo: [
    [null, 'Super Container 1', 40, 70, 90],
    [null, 'Super Container 2', 32, 95, 120],
    [null, 'Super Container 3', 9, 160, 200],
    [null, 'Super Container 4', 20, 200, 280],
    [null, 'Super Container 5', 0, 340, 400],
    ['N001', 'Venus Cutlery', 45, 85, 120],
    [null, 'Stainless Steel Pot 5L', 45, 900, 1150],
  ],
  Tulip: [
    [null, 'Thermos 1.0 Ltr', 18, 450, 525],
    [null, 'Smile Cups', 45, 540, 600],
    [null, 'Lotus Cups', 6, 450, 525],
  ],
  Kiam: [['N004', 'Rice Cooker 1.8L', 28, 2400, 2900]],
  Senso: [[null, 'Peeler', 60, 30, 50]],
  Choice: [[null, 'Peeler', 35, 60, 80]],
  'Local / Unbranded': [
    [null, 'Dustpan Brush', 14, 280, 320],
    [null, 'Plastic Cloth Clip', 80, 140, 175],
    [null, 'Tissue Box', 3, 100, 150],
    [null, 'Spray Bottle', 25, 110, 150],
  ],
};

// Wholesale orders are placed in stacks. Units per stack differ by product; everything else counts singly.
const STACK_SIZES = { Plate: 12, Bata: 24, Bucket: 6, Gamala: 4, 'Smile Cups': 12, 'Lotus Cups': 12, Peeler: 10, 'Plastic Cloth Clip': 20 };

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/inventory');
  await Promise.all([User.deleteMany({}), Company.deleteMany({}), Product.deleteMany({}), StockMovement.deleteMany({}), PriceHistory.deleteMany({}), Order.deleteMany({}), Counter.deleteMany({}), Party.deleteMany({}), LedgerEntry.deleteMany({}), Setting.deleteMany({})]);
  await mongoose.syncIndexes();

  const password = process.env.SEED_ADMIN_PASSWORD || 'ChangeMe123!';
  const passwordHash = await User.hashPassword(password);
  const [admin] = await User.create([
    { username: 'admin', displayName: 'Admin', role: 'Owner', passwordHash },
    { username: 'manager', displayName: 'Manager', role: 'manager', passwordHash },
    { username: 'staff', displayName: 'Staff', role: 'staff', passwordHash },
  ]);

  const companies = {};
  for (const name of Object.keys(NON_GEMS)) {
    companies[name] = await Company.create({ name, isLocal: name.startsWith('Local') });
  }

  const rows = [];
  for (const [productId, name, quantity, wholesalePrice, retailPrice] of GEMS) {
    rows.push({ category: 'gem', productId, name, quantity, wholesalePrice, retailPrice, stackSize: STACK_SIZES[name] || 1 });
  }
  for (const [companyName, items] of Object.entries(NON_GEMS)) {
    for (const [productId, name, quantity, wholesalePrice, retailPrice] of items) {
      rows.push({
        category: 'non_gem',
        productId: productId || undefined,
        name,
        company: companies[companyName]._id,
        quantity,
        wholesalePrice,
        retailPrice,
        stackSize: STACK_SIZES[name] || 1,
      });
    }
  }

  const products = await Product.create(rows);
  await StockMovement.create(
    products
      .filter((p) => p.quantity > 0)
      .map((p) => ({ product: p._id, type: 'initial', delta: p.quantity, quantityAfter: p.quantity, note: 'Seed data', user: admin._id }))
  );

  // Demo accounts: customers normally sit on Dr, vendors on Cr.
  const parties = await Party.create([
    { type: 'customer', name: 'Himalayan Traders', phone: '9801000001', address: 'New Road, Kathmandu', openingBalance: 12500, openingSide: 'dr', discountPercent: 5, creditDays: 30 },
    { type: 'customer', name: 'Sunrise Mart', phone: '9801000002', address: 'Lakeside, Pokhara', discountPercent: 7.5, creditDays: 15 },
    { type: 'customer', name: 'Everest Retail', phone: '9801000003', address: 'Biratnagar', discountPercent: 3, creditDays: 45 },
    { type: 'vendor', name: 'Aristo Distributors', phone: '9802000001', address: 'Teku, Kathmandu', openingBalance: 40000, openingSide: 'cr' },
    { type: 'vendor', name: 'Tulip Supplies', phone: '9802000002', address: 'Balaju, Kathmandu' },
  ]);
  const [himalayan, sunrise, everest, aristo, tulip] = parties;
  const entry = (party, date, particulars, side, amount, ref) => ({
    party: party._id, date, particulars, ref, debit: side === 'dr' ? amount : 0, credit: side === 'cr' ? amount : 0, createdBy: admin._id,
  });
  await LedgerEntry.create([
    entry(himalayan, '2026-09-02', 'Goods sold on credit', 'dr', 18000, 'INV-101'),
    entry(himalayan, '2026-09-10', 'Payment received (cash)', 'cr', 10000, 'RCPT-21'),
    entry(himalayan, '2026-09-24', 'Goods sold on credit', 'dr', 7600, 'INV-118'),
    entry(sunrise, '2026-09-05', 'Goods sold on credit', 'dr', 9200, 'INV-105'),
    entry(sunrise, '2026-09-18', 'Payment received (bank)', 'cr', 9200, 'RCPT-24'),
    entry(everest, '2026-09-20', 'Goods sold on credit', 'dr', 4300, 'INV-114'),
    entry(aristo, '2026-09-01', 'Stock purchased', 'cr', 55000, 'BILL-88'),
    entry(aristo, '2026-09-15', 'Payment made (cheque)', 'dr', 60000, 'CHQ-3012'),
    entry(tulip, '2026-09-08', 'Stock purchased', 'cr', 21500, 'BILL-91'),
    entry(tulip, '2026-09-26', 'Payment made (cash)', 'dr', 5000),
  ]);

  console.log(`Seeded ${products.length} products, ${Object.keys(companies).length} companies, ${parties.length} accounts, 3 users.`);
  console.log(`Logins: admin / manager / staff  (password: ${password})`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
