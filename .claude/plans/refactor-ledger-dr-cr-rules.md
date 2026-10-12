---
name: refactor-ledger-dr-cr-rules
description: Refactor Ledger entry automatic Dr/Cr rules based on particulars and party type.
metadata:
  type: project
---

# Context
The user wants to automate Dr/Cr side assignment in the Ledger module based on 'Particulars' and 'Party Type' (Customer/Vendor). Currently, users manually select Dr/Cr, which leads to errors. Also, the Balance column needs sign convention improvements.

# Goals
1. Automate Dr/Cr assignment:
    - Customer/Goods -> Dr
    - Customer/Cash -> Cr
    - Vendor/Goods -> Cr
    - Vendor/Cash -> Dr
2. Hide 'Side' input for Goods/Cash in form.
3. Show helper text under Amount field indicating the result (e.g., "Will be recorded as Cr").
4. Update statement table:
    - Remove Dr/Cr suffix from Balance column.
    - Show Rs. amount only (e.g., Rs. 2,20,335).
    - Use sign convention: Green for positive balance based on party type, Red for negative.
    - Keep Dr/Cr columns for Goods/Cash transactions.
5. Backend: Ignore user-sent side, enforce rule server-side.
6. Migration: Recalculate side and stored balances.

# Implementation Plan
1. **Frontend (`client/app/(app)/accounts/[id]/page.js`)**:
    - Update `Add entry` form:
        - Add logic to calculate side automatically based on party type and particulars.
        - Add helper text under Amount field.
        - Hide Side selection for Goods/Cash.
    - Update `LedgerPage` statement table and Balance column:
        - Update sign convention logic.
        - Remove Dr/Cr suffix.
2. **Backend (`server/src/routes/parties.js`)**:
    - Update `POST` and `PUT` `/:id/entries` to enforce automatic side assignment based on rules.
3. **Migration**:
    - Script to re-calculate `debit`/`credit` for existing Goods/Cash entries.
4. **Verification**:
    - Test entry creation for all 4 combinations (Customer/Vendor * Goods/Cash).
    - Check statement balance sign logic.
