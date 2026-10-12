---
name: refactor-opening-balance
description: Refactor Opening Balance handling to be a distinct entry type.
metadata:
  type: project
---

# Context
The user wants to improve how "Opening Balance" is handled. Currently, it's stored as a debit/credit transaction, causing double counting and UI issues.

# Goals
1. Store Opening Balance as a distinct entry (type: `opening_balance` or special `particulars`).
2. Display it in the Balance column only, not in Dr/Cr columns.
3. Remove duplicate Opening Balance row.
4. Update totals calculation to exclude Opening Balance.
5. Migration script for existing data.

# Implementation Plan
1. **Model (`server/src/models/LedgerEntry.js`)**:
    - Add `openingBalanceAmount` (Number).
    - Update `pre('validate')` to allow `Opening Balance` entries to have 0 debit/credit.
2. **Utils (`server/src/utils/ledger.js`)**:
    - Update `buildStatement` to read `openingBalanceAmount` for Opening Balance entries and *not* include them in totals (totalDebit/totalCredit).
3. **Routes (`server/src/routes/parties.js`)**:
    - Update `POST /:id/entries` to use `openingBalanceAmount`.
    - Update `PUT /:id/entries/:entryId` to handle the new format.
4. **Migration**:
    - Create a script to iterate over existing `LedgerEntry` with `particulars === 'Opening Balance'`, update `openingBalanceAmount` = `debit` or `credit`, and set `debit` = 0, `credit` = 0.
5. **Frontend (`client/app/(app)/accounts/[id]/page.js`)**:
    - Update form submission to handle new structure.
    - Update table display to show `openingBalanceAmount` in the Balance column and hide Dr/Cr for that row.
