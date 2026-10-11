# Inventory & Price Management System

A private, web-based system for managing products, stock levels and price lists.
Built with **Next.js (App Router)**, **Express**, **MongoDB** and **JWT auth**.

Includes inventory, stock status, price list, restock orders, customer and vendor accounts (ledgers with Dr/Cr and Bikram Sambat dates), users and roles.

## What it does

- Search products by ID or name from one box, filter by type, company and stock status
- Two categories: **Gem** items (identified by unique product ID) and **Non-Gem** items (grouped by company, ID optional)
- Stock status is derived: `out` = 0, `low` = at or below the item's threshold, `in` = above it
- Price list with wholesale and retail prices, Gems and Non-Gems on separate tabs, Non-Gems grouped by company, inline price editing
- Dashboard per category: counts, alerts that need restocking, recent activity
- Every stock change and price change is recorded (who, when, before and after)
- **Create Order** (every role, from the sidebar): build a restock list from the lowest-stock suggestions (the same items as the dashboard Alerts) or search any product. Suggested quantity tops stock up to twice the low-stock level, and items already on an open order are flagged. Orders get numbers like `ORD-0001`, can be printed, and can be cancelled by their creator or a manager
- **Sales & Invoicing** (from sidebar): sell items, choose retail/wholesale/custom pricing, apply customer standing discount, deduct inventory atomically, and post credit/partial sales directly to customer ledgers. Invoices are numbered like `INV-0001`, printable, and voidable with inventory and ledger rollbacks
- **Receiving an order** (manager/admin): one click marks an open order as received and adds the quantities to stock, with a stock history note. It can only happen once per order
- **Accounts** (manager/admin only, hidden from staff): customers and vendors, each with a ledger. Entries are Dr or Cr, the running balance is computed (never typed in), dates are entered and shown in Bikram Sambat, and a wrong entry is voided rather than deleted so the history stays honest. Statements can be printed
- **Order in stacks**: wholesale orders are placed in stacks. Each product has a "units per stack" number (1 if you count single units), the order screens say Stack, and receiving an order adds stacks × units per stack to stock
- **Account payment status**: every customer and vendor shows Settled, Due in N days, or Overdue N days, based on credit days (payments clear the oldest invoice first). Customers also carry a Discount %
- **Delete a product** (admin): removes it from inventory, the price list and suggestions while keeping its history. The Product ID can be reused
- **Settings**: business profile (shown on printed pages), inventory and order defaults (low-stock level, reorder multiplier, order number prefix), account defaults (credit days, discount), users, your own password, and CSV exports of products and accounts
- **Import CSV** (manager/admin): bulk-add products from a spreadsheet. A template is on the import page. Nothing is saved unless every row is valid, and problems are listed by row
- **Print** the price list, orders and account statements from the browser
- No public signup. Admins create accounts. Roles: `admin`, `manager` (edit stock, prices, products), `staff` (view only)

## Data rules (enforced in the database)

| Rule | How |
| --- | --- |
| Gem `productId` is required and unique | validation + partial unique index |
| Non-gem `productId` is optional, but unique when present | partial unique index on strings only |
| Non-gem names are unique **per company** (`Peeler` under Senso and Choice is fine) | partial unique index on `(company, name)` |
| Company names are case-insensitive unique | collation index |
| Stock can never go below zero, even with two people editing at once | atomic `$gte` guarded update |
| "Local / unbranded" is a real company record, not the text "Unknown" | `isLocal` flag |

## Run it locally

You need Node 20+ and a MongoDB (local install or a free Atlas cluster). Use two terminals.

**Terminal 1: API**

```
cd server
copy .env.example .env        (Mac/Linux: cp .env.example .env)
npm install
npm run seed
npm run dev
```

Edit `server/.env` first: set `MONGODB_URI` and a real `JWT_SECRET`. The API runs on http://localhost:4000.

**Terminal 2: web app**

```
cd client
copy .env.example .env.local  (Mac/Linux: cp .env.example .env.local)
npm install
npm run dev
```

Open http://localhost:3000.

Seed logins: `admin`, `manager`, `staff`. The password is `SEED_ADMIN_PASSWORD` from `server/.env`
(default `ChangeMe123!`). **Change these before any real use.**

`npm run seed` wipes the database. Never run it against real data.

The Next.js app proxies `/api/*` to the Express server (`API_URL`), so the browser only talks to one origin and the httpOnly auth cookie stays same-site.

## Tests

```bash
cd server && npm test        # status logic, model validation, app wiring
cd client && npm run lint && npm run build
```

## Project layout

```
server/src/models      User, Company, Product, StockMovement, PriceHistory, Order, Counter, Party, LedgerEntry, Sale
server/src/routes      auth, companies, products, prices, orders, sales, parties (accounts), dashboard, settings, exports
server/src/middleware  JWT cookie auth + role checks
server/src/seed.js     demo data
client/app/(app)       dashboard, inventory (list, new, import, [id]), price-list, sales (list, new, [id]), orders (list, new, [id]), accounts (list, [id] ledger), settings
client/app/login       sign in
client/components      AppShell (header + sidebar), ProductForm, shared UI, saleUi, orderUi, accountUi
```

## Deploying privately

- Run behind HTTPS (Caddy or Nginx), set `NODE_ENV=production` and a long random `JWT_SECRET`
- Restrict access to company devices with a VPN or IP allowlist
- Schedule automated MongoDB backups
- For a public portfolio demo, deploy a separate instance with seeded fake data and set `NEXT_PUBLIC_BRAND_NAME` to a neutral name

## Not built yet

- Product photos (the Figma "Add Photo" box) need file storage, for example S3-compatible storage
- Mobile app and barcode/camera scanning (planned as a later phase)
- Password reset flow (an admin can set a new password from Settings)
- Editing a ledger entry (void and re-enter instead, by design)
